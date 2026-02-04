import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface CreateCustomerData {
  customer_insert: Customer_Key;
}

export interface CreateCustomerVariables {
  firstName: string;
  lastName: string;
  email: string;
  address?: string | null;
  phone?: string | null;
  createdAt: TimestampString;
}

export interface Customer_Key {
  id: UUIDString;
  __typename?: 'Customer_Key';
}

export interface Device_Key {
  id: UUIDString;
  __typename?: 'Device_Key';
}

export interface GetRepairTicketsByCustomerData {
  repairTickets: ({
    id: UUIDString;
    issueDescription: string;
    status: string;
  } & RepairTicket_Key)[];
}

export interface GetRepairTicketsByCustomerVariables {
  customerId: UUIDString;
}

export interface ListAllDevicesData {
  devices: ({
    id: UUIDString;
    manufacturer: string;
    model: string;
    type: string;
    serialNumber: string;
  } & Device_Key)[];
}

export interface Part_Key {
  id: UUIDString;
  __typename?: 'Part_Key';
}

export interface RepairTicket_Key {
  id: UUIDString;
  __typename?: 'RepairTicket_Key';
}

export interface Service_Key {
  id: UUIDString;
  __typename?: 'Service_Key';
}

export interface UpdateRepairTicketStatusData {
  repairTicket_update?: RepairTicket_Key | null;
}

export interface UpdateRepairTicketStatusVariables {
  id: UUIDString;
  status: string;
}

interface CreateCustomerRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateCustomerVariables): MutationRef<CreateCustomerData, CreateCustomerVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateCustomerVariables): MutationRef<CreateCustomerData, CreateCustomerVariables>;
  operationName: string;
}
export const createCustomerRef: CreateCustomerRef;

export function createCustomer(vars: CreateCustomerVariables): MutationPromise<CreateCustomerData, CreateCustomerVariables>;
export function createCustomer(dc: DataConnect, vars: CreateCustomerVariables): MutationPromise<CreateCustomerData, CreateCustomerVariables>;

interface GetRepairTicketsByCustomerRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetRepairTicketsByCustomerVariables): QueryRef<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetRepairTicketsByCustomerVariables): QueryRef<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;
  operationName: string;
}
export const getRepairTicketsByCustomerRef: GetRepairTicketsByCustomerRef;

export function getRepairTicketsByCustomer(vars: GetRepairTicketsByCustomerVariables): QueryPromise<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;
export function getRepairTicketsByCustomer(dc: DataConnect, vars: GetRepairTicketsByCustomerVariables): QueryPromise<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;

interface UpdateRepairTicketStatusRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateRepairTicketStatusVariables): MutationRef<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateRepairTicketStatusVariables): MutationRef<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;
  operationName: string;
}
export const updateRepairTicketStatusRef: UpdateRepairTicketStatusRef;

export function updateRepairTicketStatus(vars: UpdateRepairTicketStatusVariables): MutationPromise<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;
export function updateRepairTicketStatus(dc: DataConnect, vars: UpdateRepairTicketStatusVariables): MutationPromise<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;

interface ListAllDevicesRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListAllDevicesData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListAllDevicesData, undefined>;
  operationName: string;
}
export const listAllDevicesRef: ListAllDevicesRef;

export function listAllDevices(): QueryPromise<ListAllDevicesData, undefined>;
export function listAllDevices(dc: DataConnect): QueryPromise<ListAllDevicesData, undefined>;

