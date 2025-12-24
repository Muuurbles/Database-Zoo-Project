"use client";
import { UnifiedTransaction } from "@/types/transaction.types";
import apiClient from "@/lib/api";

export interface PaginatedTransactionResponse {
    data: UnifiedTransaction[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export const transactionService = {
    getAll: async (page: number = 1, limit: number = 25): Promise<PaginatedTransactionResponse> => {
        const response = await apiClient.get<PaginatedTransactionResponse>(`/transactions?page=${page}&limit=${limit}`);
        return response.data;
    }
};
