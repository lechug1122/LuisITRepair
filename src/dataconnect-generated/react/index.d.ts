import { CreateCustomerData, CreateCustomerVariables, GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables, UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables, ListAllDevicesData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateCustomer(options?: useDataConnectMutationOptions<CreateCustomerData, FirebaseError, CreateCustomerVariables>): UseDataConnectMutationResult<CreateCustomerData, CreateCustomerVariables>;
export function useCreateCustomer(dc: DataConnect, options?: useDataConnectMutationOptions<CreateCustomerData, FirebaseError, CreateCustomerVariables>): UseDataConnectMutationResult<CreateCustomerData, CreateCustomerVariables>;

export function useGetRepairTicketsByCustomer(vars: GetRepairTicketsByCustomerVariables, options?: useDataConnectQueryOptions<GetRepairTicketsByCustomerData>): UseDataConnectQueryResult<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;
export function useGetRepairTicketsByCustomer(dc: DataConnect, vars: GetRepairTicketsByCustomerVariables, options?: useDataConnectQueryOptions<GetRepairTicketsByCustomerData>): UseDataConnectQueryResult<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;

export function useUpdateRepairTicketStatus(options?: useDataConnectMutationOptions<UpdateRepairTicketStatusData, FirebaseError, UpdateRepairTicketStatusVariables>): UseDataConnectMutationResult<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;
export function useUpdateRepairTicketStatus(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateRepairTicketStatusData, FirebaseError, UpdateRepairTicketStatusVariables>): UseDataConnectMutationResult<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;

export function useListAllDevices(options?: useDataConnectQueryOptions<ListAllDevicesData>): UseDataConnectQueryResult<ListAllDevicesData, undefined>;
export function useListAllDevices(dc: DataConnect, options?: useDataConnectQueryOptions<ListAllDevicesData>): UseDataConnectQueryResult<ListAllDevicesData, undefined>;
