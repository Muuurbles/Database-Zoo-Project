import { Employee, EmployeeModel } from '../models/employee.model';
import { query, withTransaction, syncAccountEmail } from '../config/database';
import bcrypt from 'bcrypt';

export class EmployeeService {
  static async getAllEmployees(): Promise<Employee[]> {
    return await EmployeeModel.findAll();
  }

  static async getAllEmployeesIncludingDeleted(): Promise<Employee[]> {
    return await EmployeeModel.findAllIncludingDeleted();
  }

  static async createEmployee(employeeData: Omit<Employee, 'employee_id'> & { password: string }): Promise<Employee> {
    const { password, ...employee } = employeeData;

    // Validate required fields for user account creation
    if (!employee.email) {
      throw new Error('Email is required for creating an employee');
    }
    if (!password) {
      throw new Error('Password is required for creating an employee');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    return withTransaction(async () => {
      // Step 1: Create the employee
      const newEmployee = await EmployeeModel.create(employee);

      // Step 2: Create user account (use email as username)
      const userAccountResult = await query<any>(
        'INSERT INTO user_accounts (username, email, role, employee_id) VALUES (?, ?, ?, ?)',
        [employee.email, employee.email, 'employee', newEmployee.employee_id]
      );
      const accountId = userAccountResult.insertId;

      // Step 3: Save the password (hashed)
      await query('INSERT INTO passwords (account_id, password_hash) VALUES (?, ?)', [accountId, hashedPassword]);

      return newEmployee;
    });
  }

  static async getEmployeeById(id: number): Promise<Employee | null> {
    return await EmployeeModel.findById(id);
  }

  static async updateEmployee(id: number, updates: Partial<Employee> & { password?: string }): Promise<Employee | null> {
    const { password, ...employeeUpdates } = updates;
    const hashedPassword = password && password.trim() !== '' ? await bcrypt.hash(password, 10) : null;

    // Part-time employees have no salary (chk_salary); don't keep the old one when switching over
    if (employeeUpdates.employment_type === 'part_time') {
      (employeeUpdates as any).salary = null;
    }

    return withTransaction(async () => {
      // Update the employee record (without password)
      const updatedEmployee = await EmployeeModel.update(id, employeeUpdates);
      if (!updatedEmployee) return null;

      if (employeeUpdates.email) {
        await syncAccountEmail('employee_id', id, employeeUpdates.email);
      }

      // If a new password was provided, update it in the passwords table
      if (hashedPassword) {
        const [account] = await query<any[]>(
          'SELECT account_id FROM user_accounts WHERE employee_id = ?',
          [id]
        );

        if (account) {
          await query(
            'UPDATE passwords SET password_hash = ? WHERE account_id = ?',
            [hashedPassword, account.account_id]
          );
        }
      }

      return updatedEmployee;
    });
  }

  static async deleteEmployee(id: number): Promise<void> {
    // Check if this employee is a zookeeper before deleting
    const employee = await EmployeeModel.findById(id);

    // If the employee is a zookeeper, delete all their assignments
    // This makes the animals unassigned instead of keeping assignments to a deleted keeper
    if (employee && employee.job_role === 'keeper') {
      await query('DELETE FROM zookeeper_assignments WHERE keeper_id = ?', [id]);
    }

    return await EmployeeModel.remove(id);
  }

  static async restoreEmployee(id: number): Promise<Employee | null> {
    return await EmployeeModel.restore(id);
  }
}
