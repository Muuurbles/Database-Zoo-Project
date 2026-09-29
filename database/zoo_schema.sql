-- Zoo Database Schema (SQLite)
--
-- Applied automatically by backend/src/config/database.ts the first time the
-- backend starts against an empty database file. `npm run db:reset` (from
-- backend/) deletes the database file and rebuilds it from this schema plus
-- database/seed_data.sql.
--
-- How the original MySQL features map to SQLite:
--   * ENUM columns are TEXT with a CHECK constraint.
--   * DECIMAL columns are REAL, so arithmetic in SQL is never integer division.
--   * Text columns are COLLATE NOCASE to keep MySQL's case-insensitive
--     comparisons (e.g. logging in with a differently-cased email).
--   * Timestamps default to Central Standard Time (UTC-6, no DST) via
--     datetime('now', '-6 hours'), the same fixed offset the app used with MySQL.
--   * ON UPDATE CURRENT_TIMESTAMP is implemented with small triggers.
--   * Trigger cursors/variables don't exist in SQLite, so they are written as
--     INSERT ... SELECT statements instead.
--   * The MySQL stored procedure + EVENT that auto-renewed memberships now lives
--     in backend/src/jobs/membership-renewal.job.ts.
--
-- Connections must run `PRAGMA foreign_keys = ON` (the backend does this).

CREATE TABLE employees (
    employee_id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name VARCHAR(50) NOT NULL COLLATE NOCASE,
    last_name VARCHAR(50) NOT NULL COLLATE NOCASE,
    email VARCHAR(100) UNIQUE COLLATE NOCASE,
    phone VARCHAR(20) COLLATE NOCASE,
    ssn CHAR(11) UNIQUE NOT NULL COLLATE NOCASE,
    job_role TEXT NOT NULL CHECK (job_role IN ('keeper', 'manager', 'coordinator', 'cashier', 'guide', 'veterinarian', 'maintenance', 'security', 'other')),
    employment_type TEXT NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time')),
    salary REAL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    hire_date DATE,
    address VARCHAR(255) COLLATE NOCASE,
    city VARCHAR(50) COLLATE NOCASE,
    state VARCHAR(50) COLLATE NOCASE,
    zip_code VARCHAR(10) COLLATE NOCASE,
    gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    birthday DATE,
    deleted_at DATETIME DEFAULT NULL,
    CONSTRAINT chk_salary CHECK ((employment_type = 'full_time' AND salary IS NOT NULL) OR (employment_type = 'part_time' AND salary IS NULL))
);

CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name VARCHAR(50) NOT NULL COLLATE NOCASE,
    last_name VARCHAR(50) NOT NULL COLLATE NOCASE,
    email VARCHAR(100) UNIQUE COLLATE NOCASE,
    phone VARCHAR(20) COLLATE NOCASE,
    address VARCHAR(200) COLLATE NOCASE,
    city VARCHAR(50) COLLATE NOCASE,
    state VARCHAR(50) COLLATE NOCASE,
    zip_code VARCHAR(10) COLLATE NOCASE,
    annual_pass TEXT DEFAULT 'no' CHECK (annual_pass IN ('yes', 'no')),
    membership_start_date DATE DEFAULT NULL,
    membership_end_date DATE DEFAULT NULL,
    membership_auto_renew BOOLEAN DEFAULT 0,
    registration_date DATE,
    deleted_at DATETIME DEFAULT NULL
);
CREATE INDEX idx_customer_email ON customers(email);

CREATE TABLE attractions (
    attraction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL COLLATE NOCASE,
    location VARCHAR(100) COLLATE NOCASE,
    human_capacity INT,
    opening_time TIME,
    closing_time TIME,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'maintenance')),
    deleted_at DATETIME DEFAULT NULL
);

CREATE TABLE gift_shops (
    gift_shop_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL COLLATE NOCASE,
    location VARCHAR(100) COLLATE NOCASE,
    opening_time TIME,
    closing_time TIME,
    manager_id INT,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (manager_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);

CREATE TABLE cafes (
    cafe_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL COLLATE NOCASE,
    location VARCHAR(100) COLLATE NOCASE,
    opening_time TIME,
    closing_time TIME,
    manager_id INT,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (manager_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);

CREATE TABLE events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL COLLATE NOCASE,
    description TEXT COLLATE NOCASE,
    event_date DATE,
    start_time TIME,
    end_time TIME,
    location VARCHAR(100) COLLATE NOCASE,
    max_participants INT,
    ticket_price REAL,
    image_url VARCHAR(500) NULL,
    coordinator_id INT,
    created_at DATETIME DEFAULT (datetime('now', '-6 hours')),
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (coordinator_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);

-- Entities with one level of dependency
CREATE TABLE user_accounts (
    account_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(80) UNIQUE NOT NULL COLLATE NOCASE,
    email VARCHAR(100) UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('employee', 'customer')),
    employee_id INT UNIQUE,
    customer_id INT UNIQUE,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT (datetime('now', '-6 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '-6 hours')),
    CONSTRAINT chk_user_owner CHECK ((employee_id IS NOT NULL AND customer_id IS NULL) OR (employee_id IS NULL AND customer_id IS NOT NULL)),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

-- Passwords table for user authentication
CREATE TABLE passwords (
    password_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INT NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT (datetime('now', '-6 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '-6 hours')),
    FOREIGN KEY (account_id) REFERENCES user_accounts(account_id) ON DELETE CASCADE
);

CREATE TABLE habitats (
    habitat_id INTEGER PRIMARY KEY AUTOINCREMENT,
    habitat_name VARCHAR(100) NOT NULL COLLATE NOCASE,
    attraction_id INT,
    size VARCHAR(50) COLLATE NOCASE,
    environment_type VARCHAR(50) COLLATE NOCASE,
    animal_capacity INT DEFAULT 10,
    cleaning_schedule VARCHAR(100) COLLATE NOCASE,
    last_maintenance DATE,
    image_url VARCHAR(500) NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'renovation', 'closed')),
    created_date DATETIME DEFAULT (datetime('now', '-6 hours')),
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (attraction_id) REFERENCES attractions(attraction_id) ON DELETE SET NULL
);

CREATE TABLE animals (
    animal_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL COLLATE NOCASE,
    scientific_name VARCHAR(100) COLLATE NOCASE,
    species VARCHAR(100) NOT NULL COLLATE NOCASE,
    date_of_birth DATE,
    arrival_date DATE NOT NULL,
    gender TEXT CHECK (gender IN ('male', 'female', 'unknown')),
    place_of_origin VARCHAR(100) COLLATE NOCASE,
    habitat_id INT,
    medical_notes TEXT COLLATE NOCASE,
    health_status TEXT DEFAULT 'good' CHECK (health_status IN ('excellent', 'good', 'fair', 'poor', 'critical')),
    active_status TEXT DEFAULT 'active' CHECK (active_status IN ('active', 'transferred', 'deceased')),
    endangerment_status TEXT DEFAULT 'least_concern' CHECK (endangerment_status IN ('least_concern', 'near_threatened', 'vulnerable', 'endangered', 'critically_endangered', 'extinct_in_the_wild', 'extinct')),
    weight REAL,
    image_url VARCHAR(500) NULL,
    deletion_notes TEXT COLLATE NOCASE,
    created_date DATETIME DEFAULT (datetime('now', '-6 hours')),
    updated_date DATETIME DEFAULT (datetime('now', '-6 hours')),
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (habitat_id) REFERENCES habitats(habitat_id) ON DELETE SET NULL
);
CREATE INDEX idx_animal_species ON animals(species);

CREATE TABLE tickets (
    ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INT,
    purchase_date DATETIME DEFAULT (datetime('now', '-6 hours')),
    visit_date DATE,
    ticket_type TEXT NOT NULL CHECK (ticket_type IN ('adult', 'child', 'senior', 'student')),
    price REAL NOT NULL,
    payment_method TEXT CHECK (payment_method IN ('cash', 'credit', 'debit')), -- NOTE: payment_method is not currently displayed in financial reports and is kept for historical tracking
    sold_by INT,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL,
    FOREIGN KEY (sold_by) REFERENCES employees(employee_id) ON DELETE SET NULL
);
CREATE INDEX idx_ticket_date ON tickets(visit_date);

CREATE TABLE donations (
    donation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INT,
    amount REAL NOT NULL,
    donation_date DATETIME DEFAULT (datetime('now', '-6 hours')),
    message TEXT COLLATE NOCASE,
    donation_type TEXT DEFAULT 'general' CHECK (donation_type IN ('general', 'conservation', 'research', 'animal_care')), -- NOTE: donation_type is not currently used in the application and is kept for future expansion
    payment_method TEXT CHECK (payment_method IN ('cash', 'credit', 'debit')), -- NOTE: payment_method is not currently displayed in the UI and is kept for historical tracking purposes
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL
);

-- Saved cards for customers (defined before membership_purchases, which references it)
CREATE TABLE customer_payment_methods (
    payment_method_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INT NOT NULL UNIQUE,
    card_number VARCHAR(19) NOT NULL,
    cardholder_name VARCHAR(100) NOT NULL COLLATE NOCASE,
    expiry_month TINYINT NOT NULL,
    expiry_year SMALLINT NOT NULL,
    cvv VARCHAR(4),
    billing_address VARCHAR(200) COLLATE NOCASE,
    billing_city VARCHAR(50) COLLATE NOCASE,
    billing_state VARCHAR(50) COLLATE NOCASE,
    billing_zip VARCHAR(10) COLLATE NOCASE,
    created_at DATETIME DEFAULT (datetime('now', '-6 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '-6 hours')),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);
CREATE INDEX idx_customer_payment ON customer_payment_methods(customer_id);

CREATE TABLE membership_purchases (
    purchase_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INT NOT NULL,
    purchase_date DATETIME DEFAULT (datetime('now', '-6 hours')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    price REAL NOT NULL,
    payment_method TEXT CHECK (payment_method IN ('cash', 'credit', 'debit')), -- NOTE: payment_method is not currently displayed in financial reports and is kept for historical tracking
    auto_renewed BOOLEAN DEFAULT 0,
    payment_method_id INT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    FOREIGN KEY (payment_method_id) REFERENCES customer_payment_methods(payment_method_id) ON DELETE SET NULL
);
CREATE INDEX idx_customer_purchases ON membership_purchases(customer_id, purchase_date);

CREATE TABLE gift_shop_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_shop_id INT NOT NULL,
    name VARCHAR(100) NOT NULL COLLATE NOCASE,
    description TEXT COLLATE NOCASE,
    category VARCHAR(50) COLLATE NOCASE,
    price REAL NOT NULL,
    cost REAL,
    quantity_in_stock INT DEFAULT 0,
    supplier VARCHAR(100) COLLATE NOCASE,
    image_url VARCHAR(500) NULL,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (gift_shop_id) REFERENCES gift_shops(gift_shop_id) ON DELETE CASCADE
);

CREATE TABLE cafe_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    cafe_id INT NOT NULL,
    name VARCHAR(100) NOT NULL COLLATE NOCASE,
    description TEXT COLLATE NOCASE,
    category VARCHAR(50) COLLATE NOCASE,
    price REAL NOT NULL,
    is_available BOOLEAN DEFAULT 1,
    image_url VARCHAR(500) NULL,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (cafe_id) REFERENCES cafes(cafe_id) ON DELETE CASCADE
);

CREATE TABLE event_registrations (
    registration_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INT NOT NULL,
    customer_id INT,
    registration_date DATETIME DEFAULT (datetime('now', '-6 hours')),
    number_of_participants INT DEFAULT 1,
    total_amount REAL,
    -- NOTE: pending status is not used in the system. All registrations are created with 'paid' status.
    -- The CHECK retains 'pending' for backwards compatibility but it should not be used for new registrations.
    payment_status TEXT DEFAULT 'paid' CHECK (payment_status IN ('pending', 'paid', 'cancelled')),
    refunded_at DATETIME DEFAULT NULL,
    refund_reason VARCHAR(255) DEFAULT NULL COLLATE NOCASE,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL
);

-- Models the many-to-many relationship between keepers and animals
CREATE TABLE zookeeper_assignments (
    assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    keeper_id INT NOT NULL,
    animal_id INT NOT NULL,
    shift VARCHAR(50) COLLATE NOCASE,
    FOREIGN KEY (keeper_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE,
    UNIQUE (keeper_id, animal_id)
);

-- Defines the standard diet for an animal
CREATE TABLE feeding_schedules (
    schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INT NOT NULL,
    food_description VARCHAR(255) NOT NULL COLLATE NOCASE,
    frequency VARCHAR(100) COLLATE NOCASE,
    scheduled_time TIME,
    notes TEXT COLLATE NOCASE,
    FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE
);

-- A log of every feeding event
CREATE TABLE feeding_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INT NOT NULL,
    keeper_id INT,
    feeding_time DATETIME DEFAULT (datetime('now', '-6 hours')),
    food_given VARCHAR(255) NOT NULL COLLATE NOCASE,
    quantity_given VARCHAR(50) COLLATE NOCASE,
    notes TEXT COLLATE NOCASE,
    FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE,
    FOREIGN KEY (keeper_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);

-- Parent table for a single gift shop transaction
CREATE TABLE gift_shop_sales_transactions (
    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_shop_id INT NOT NULL,
    customer_id INT,
    employee_id INT,
    sale_date DATETIME DEFAULT (datetime('now', '-6 hours')),
    total_amount REAL NOT NULL,
    payment_method TEXT CHECK (payment_method IN ('cash', 'credit', 'debit')), -- NOTE: payment_method is not currently displayed in financial reports and is not really used anywhere in the system
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'returned')),
    FOREIGN KEY (gift_shop_id) REFERENCES gift_shops(gift_shop_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);

-- Linking table for items within a gift shop transaction
CREATE TABLE gift_shop_sale_items (
    sale_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES gift_shop_sales_transactions(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES gift_shop_items(item_id) ON DELETE RESTRICT
);

CREATE TABLE cafe_sales (
    sale_id INTEGER PRIMARY KEY AUTOINCREMENT,
    cafe_id INT NOT NULL,
    transaction_id VARCHAR(255) NOT NULL COLLATE NOCASE,
    customer_id INT,
    employee_id INT,
    item_id INT NOT NULL,
    quantity INT NOT NULL,
    line_total REAL NOT NULL,
    sale_timestamp DATETIME DEFAULT (datetime('now', '-6 hours')),
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'returned')),
    FOREIGN KEY (cafe_id) REFERENCES cafes(cafe_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
    FOREIGN KEY (item_id) REFERENCES cafe_items(item_id)
);

-- Notifications table for user alerts (e.g., membership expiration warnings).
-- A notification targets either a customer or an employee (e.g. veterinarian alerts).
CREATE TABLE notifications (
    notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INT NULL,
    employee_id INT NULL,
    message VARCHAR(500) NOT NULL COLLATE NOCASE,
    notification_type TEXT DEFAULT 'info' CHECK (notification_type IN ('info', 'warning', 'alert')),
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', '-6 hours')),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);
CREATE INDEX idx_customer_unread ON notifications(customer_id, is_read);
CREATE INDEX idx_created_at ON notifications(created_at);

CREATE TABLE animals_alert_queue (
    animal_alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_reason TEXT NOT NULL CHECK (alert_reason IN ('health_status', 'active_status')),
    alert_value VARCHAR(50) COLLATE NOCASE,
    created_at DATETIME DEFAULT (datetime('now', '-6 hours')),
    processed_at DATETIME DEFAULT NULL,
    animal_id INT NOT NULL,
    FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE
);
CREATE INDEX idx_processed_at ON animals_alert_queue(processed_at);

-- Indexes for soft delete columns (performance optimization)
CREATE INDEX idx_employees_deleted ON employees(deleted_at);
CREATE INDEX idx_customers_deleted ON customers(deleted_at);
CREATE INDEX idx_animals_deleted ON animals(deleted_at);
CREATE INDEX idx_habitats_deleted ON habitats(deleted_at);
CREATE INDEX idx_events_deleted ON events(deleted_at);
CREATE INDEX idx_gift_shops_deleted ON gift_shops(deleted_at);
CREATE INDEX idx_cafes_deleted ON cafes(deleted_at);
CREATE INDEX idx_tickets_deleted ON tickets(deleted_at);

-- ====================================================================
-- PERFORMANCE INDEXES - Added for frequently queried columns
-- ====================================================================

-- Animals: Filtered by health_status and active_status frequently
CREATE INDEX idx_animal_health_status ON animals(health_status, active_status);

-- Animals: Queries that filter deleted + active status together
CREATE INDEX idx_animal_active_deleted ON animals(active_status, deleted_at);

-- Tickets: Purchase date used in financial reports
CREATE INDEX idx_ticket_purchase_date ON tickets(purchase_date);

-- Tickets: Visit date range queries common
CREATE INDEX idx_ticket_date_range ON tickets(visit_date, purchase_date);

-- Event registrations: Lookup by event_id (cancellations, participant counts)
CREATE INDEX idx_event_reg_event ON event_registrations(event_id, payment_status);

-- Event registrations: Date range queries for reports
CREATE INDEX idx_event_reg_date ON event_registrations(registration_date);

-- Gift shop sales: Date used in financial reports
CREATE INDEX idx_gift_shop_sale_date ON gift_shop_sales_transactions(sale_date, status);

-- Gift shop sale items: Transaction lookup
CREATE INDEX idx_gift_shop_items_trans ON gift_shop_sale_items(transaction_id);

-- Cafe sales: Timestamp used in financial reports
CREATE INDEX idx_cafe_sale_timestamp ON cafe_sales(sale_timestamp, status);

-- Cafe sales: Cafe-specific queries
CREATE INDEX idx_cafe_sale_cafe ON cafe_sales(cafe_id, sale_timestamp);

-- Donations: Date used in reports
CREATE INDEX idx_donation_date ON donations(donation_date);

-- Feeding logs: Animal history lookups
CREATE INDEX idx_feeding_animal ON feeding_logs(animal_id, feeding_time);

-- Zookeeper assignments: Keeper dashboard queries
CREATE INDEX idx_assignment_keeper ON zookeeper_assignments(keeper_id);

-- Habitats: Status filtering common
CREATE INDEX idx_habitat_status ON habitats(status, deleted_at);

-- Employees: Active employee queries
CREATE INDEX idx_employee_status ON employees(status, deleted_at);

-- User accounts: Email login lookups
CREATE INDEX idx_user_email ON user_accounts(email);

-- ====================================================================
-- TRIGGERS
-- ====================================================================

-- MySQL's `ON UPDATE CURRENT_TIMESTAMP`: bump the timestamp unless the update set it explicitly.
CREATE TRIGGER trg_user_accounts_updated_at
AFTER UPDATE ON user_accounts
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE user_accounts SET updated_at = datetime('now', '-6 hours') WHERE account_id = NEW.account_id;
END;

CREATE TRIGGER trg_passwords_updated_at
AFTER UPDATE ON passwords
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE passwords SET updated_at = datetime('now', '-6 hours') WHERE password_id = NEW.password_id;
END;

CREATE TRIGGER trg_animals_updated_date
AFTER UPDATE ON animals
FOR EACH ROW
WHEN NEW.updated_date IS OLD.updated_date
BEGIN
    UPDATE animals SET updated_date = datetime('now', '-6 hours') WHERE animal_id = NEW.animal_id;
END;

CREATE TRIGGER trg_customer_payment_methods_updated_at
AFTER UPDATE ON customer_payment_methods
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE customer_payment_methods SET updated_at = datetime('now', '-6 hours') WHERE payment_method_id = NEW.payment_method_id;
END;

-- Alert veterinarians when an animal's health becomes poor/critical.
-- Keeps at most one unprocessed queue entry per animal+reason (refreshing it if one exists),
-- and notifies every veterinarian.
CREATE TRIGGER trg_animal_health_alert
AFTER UPDATE ON animals
FOR EACH ROW
WHEN NEW.health_status IN ('poor', 'critical') AND NEW.health_status != OLD.health_status
BEGIN
    UPDATE animals_alert_queue
    SET alert_value = NEW.health_status,
        created_at = datetime('now', '-6 hours')
    WHERE animal_id = NEW.animal_id
      AND alert_reason = 'health_status'
      AND processed_at IS NULL;

    INSERT INTO animals_alert_queue (alert_reason, alert_value, animal_id)
    SELECT 'health_status', NEW.health_status, NEW.animal_id
    WHERE NOT EXISTS (
        SELECT 1 FROM animals_alert_queue
        WHERE animal_id = NEW.animal_id
          AND alert_reason = 'health_status'
          AND processed_at IS NULL
    );

    INSERT INTO notifications (employee_id, message, notification_type, created_at)
    SELECT employee_id,
           'Alert: Animal "' || NEW.name || ' health status is now "' || NEW.health_status || '". Immediate attention required.',
           'alert',
           datetime('now', '-6 hours')
    FROM employees
    WHERE job_role = 'veterinarian';
END;

-- Alert veterinarians when an animal is marked deceased.
CREATE TRIGGER trg_animal_deceased_alert
AFTER UPDATE ON animals
FOR EACH ROW
WHEN NEW.active_status = 'deceased' AND NEW.active_status != OLD.active_status
BEGIN
    UPDATE animals_alert_queue
    SET created_at = datetime('now', '-6 hours')
    WHERE animal_id = NEW.animal_id
      AND alert_reason = 'active_status'
      AND processed_at IS NULL;

    INSERT INTO animals_alert_queue (alert_reason, alert_value, animal_id)
    SELECT 'active_status', NEW.active_status, NEW.animal_id
    WHERE NOT EXISTS (
        SELECT 1 FROM animals_alert_queue
        WHERE animal_id = NEW.animal_id
          AND alert_reason = 'active_status'
          AND processed_at IS NULL
    );
END;

-- Notify customers of expiring memberships (within 30 days) and auto-expire past memberships.
-- SQLite has no DATE_FORMAT, so "%M %d, %Y" (e.g. "March 05, 2025") is built from a padded
-- month-name lookup: each name is padded to 10 characters, and substr() picks the Nth one.
CREATE TRIGGER trg_membership_expiration_notification
AFTER UPDATE ON customers
FOR EACH ROW
WHEN NEW.annual_pass = 'yes' AND NEW.membership_end_date IS NOT NULL
BEGIN
    -- Expiring in 1-30 days: warn, but at most once per week for the same expiry date
    INSERT INTO notifications (customer_id, message, notification_type, created_at)
    SELECT NEW.customer_id,
           'Your membership expires on '
               || trim(substr('January   February  March     April     May       June      July      August    September October   November  December  ', (CAST(strftime('%m', NEW.membership_end_date) AS INTEGER) - 1) * 10 + 1, 10))
               || ' ' || strftime('%d', NEW.membership_end_date) || ', ' || strftime('%Y', NEW.membership_end_date)
               || '. Renew now to continue enjoying member benefits!',
           'warning',
           datetime('now', '-6 hours')
    WHERE CAST(julianday(date(NEW.membership_end_date)) - julianday(date('now', '-6 hours')) AS INTEGER) BETWEEN 1 AND 30
      AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.customer_id = NEW.customer_id
            AND n.message LIKE '%'
                || trim(substr('January   February  March     April     May       June      July      August    September October   November  December  ', (CAST(strftime('%m', NEW.membership_end_date) AS INTEGER) - 1) * 10 + 1, 10))
                || ' ' || strftime('%d', NEW.membership_end_date) || ', ' || strftime('%Y', NEW.membership_end_date)
                || '%'
            AND date(n.created_at) >= date('now', '-6 hours', '-7 days')
      );

    -- Already past the end date: expire the pass
    UPDATE customers
    SET annual_pass = 'no'
    WHERE customer_id = NEW.customer_id
      AND NEW.membership_end_date < date('now', '-6 hours');
END;

-- Notify customers and refund registrations when an event is cancelled (soft-deleted).
CREATE TRIGGER trigger_event_cancellation
AFTER UPDATE ON events
FOR EACH ROW
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
    INSERT INTO notifications (customer_id, message, notification_type, is_read, created_at)
    SELECT DISTINCT er.customer_id,
           'CANCELLATION: The event "' || NEW.name || '" scheduled for '
               || trim(substr('January   February  March     April     May       June      July      August    September October   November  December  ', (CAST(strftime('%m', NEW.event_date) AS INTEGER) - 1) * 10 + 1, 10))
               || ' ' || strftime('%d', NEW.event_date) || ', ' || strftime('%Y', NEW.event_date)
               || CASE
                      WHEN NEW.start_time IS NOT NULL THEN
                          ' at ' || printf('%02d', (CAST(substr(NEW.start_time, 1, 2) AS INTEGER) + 11) % 12 + 1)
                                 || ':' || substr(NEW.start_time, 4, 2)
                                 || CASE WHEN CAST(substr(NEW.start_time, 1, 2) AS INTEGER) < 12 THEN ' AM' ELSE ' PM' END
                      ELSE ''
                  END
               || ' has been cancelled. We sincerely apologize for any inconvenience this may cause. '
               || 'A full refund has been automatically processed for your registration.',
           'alert',
           0,
           datetime('now', '-6 hours')
    FROM event_registrations er
    WHERE er.event_id = NEW.event_id
      AND er.customer_id IS NOT NULL;

    UPDATE event_registrations
    SET refunded_at = datetime('now', '-6 hours'),
        refund_reason = 'Event cancelled'
    WHERE event_id = NEW.event_id
      AND refunded_at IS NULL;
END;
