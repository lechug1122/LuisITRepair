# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetRepairTicketsByCustomer*](#getrepairticketsbycustomer)
  - [*ListAllDevices*](#listalldevices)
- [**Mutations**](#mutations)
  - [*CreateCustomer*](#createcustomer)
  - [*UpdateRepairTicketStatus*](#updaterepairticketstatus)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetRepairTicketsByCustomer
You can execute the `GetRepairTicketsByCustomer` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getRepairTicketsByCustomer(vars: GetRepairTicketsByCustomerVariables): QueryPromise<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;

interface GetRepairTicketsByCustomerRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetRepairTicketsByCustomerVariables): QueryRef<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;
}
export const getRepairTicketsByCustomerRef: GetRepairTicketsByCustomerRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getRepairTicketsByCustomer(dc: DataConnect, vars: GetRepairTicketsByCustomerVariables): QueryPromise<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;

interface GetRepairTicketsByCustomerRef {
  ...
  (dc: DataConnect, vars: GetRepairTicketsByCustomerVariables): QueryRef<GetRepairTicketsByCustomerData, GetRepairTicketsByCustomerVariables>;
}
export const getRepairTicketsByCustomerRef: GetRepairTicketsByCustomerRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getRepairTicketsByCustomerRef:
```typescript
const name = getRepairTicketsByCustomerRef.operationName;
console.log(name);
```

### Variables
The `GetRepairTicketsByCustomer` query requires an argument of type `GetRepairTicketsByCustomerVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetRepairTicketsByCustomerVariables {
  customerId: UUIDString;
}
```
### Return Type
Recall that executing the `GetRepairTicketsByCustomer` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetRepairTicketsByCustomerData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetRepairTicketsByCustomerData {
  repairTickets: ({
    id: UUIDString;
    issueDescription: string;
    status: string;
  } & RepairTicket_Key)[];
}
```
### Using `GetRepairTicketsByCustomer`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getRepairTicketsByCustomer, GetRepairTicketsByCustomerVariables } from '@dataconnect/generated';

// The `GetRepairTicketsByCustomer` query requires an argument of type `GetRepairTicketsByCustomerVariables`:
const getRepairTicketsByCustomerVars: GetRepairTicketsByCustomerVariables = {
  customerId: ..., 
};

// Call the `getRepairTicketsByCustomer()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getRepairTicketsByCustomer(getRepairTicketsByCustomerVars);
// Variables can be defined inline as well.
const { data } = await getRepairTicketsByCustomer({ customerId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getRepairTicketsByCustomer(dataConnect, getRepairTicketsByCustomerVars);

console.log(data.repairTickets);

// Or, you can use the `Promise` API.
getRepairTicketsByCustomer(getRepairTicketsByCustomerVars).then((response) => {
  const data = response.data;
  console.log(data.repairTickets);
});
```

### Using `GetRepairTicketsByCustomer`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getRepairTicketsByCustomerRef, GetRepairTicketsByCustomerVariables } from '@dataconnect/generated';

// The `GetRepairTicketsByCustomer` query requires an argument of type `GetRepairTicketsByCustomerVariables`:
const getRepairTicketsByCustomerVars: GetRepairTicketsByCustomerVariables = {
  customerId: ..., 
};

// Call the `getRepairTicketsByCustomerRef()` function to get a reference to the query.
const ref = getRepairTicketsByCustomerRef(getRepairTicketsByCustomerVars);
// Variables can be defined inline as well.
const ref = getRepairTicketsByCustomerRef({ customerId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getRepairTicketsByCustomerRef(dataConnect, getRepairTicketsByCustomerVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.repairTickets);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.repairTickets);
});
```

## ListAllDevices
You can execute the `ListAllDevices` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listAllDevices(): QueryPromise<ListAllDevicesData, undefined>;

interface ListAllDevicesRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListAllDevicesData, undefined>;
}
export const listAllDevicesRef: ListAllDevicesRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listAllDevices(dc: DataConnect): QueryPromise<ListAllDevicesData, undefined>;

interface ListAllDevicesRef {
  ...
  (dc: DataConnect): QueryRef<ListAllDevicesData, undefined>;
}
export const listAllDevicesRef: ListAllDevicesRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listAllDevicesRef:
```typescript
const name = listAllDevicesRef.operationName;
console.log(name);
```

### Variables
The `ListAllDevices` query has no variables.
### Return Type
Recall that executing the `ListAllDevices` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListAllDevicesData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListAllDevicesData {
  devices: ({
    id: UUIDString;
    manufacturer: string;
    model: string;
    type: string;
    serialNumber: string;
  } & Device_Key)[];
}
```
### Using `ListAllDevices`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listAllDevices } from '@dataconnect/generated';


// Call the `listAllDevices()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listAllDevices();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listAllDevices(dataConnect);

console.log(data.devices);

// Or, you can use the `Promise` API.
listAllDevices().then((response) => {
  const data = response.data;
  console.log(data.devices);
});
```

### Using `ListAllDevices`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listAllDevicesRef } from '@dataconnect/generated';


// Call the `listAllDevicesRef()` function to get a reference to the query.
const ref = listAllDevicesRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listAllDevicesRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.devices);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.devices);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateCustomer
You can execute the `CreateCustomer` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createCustomer(vars: CreateCustomerVariables): MutationPromise<CreateCustomerData, CreateCustomerVariables>;

interface CreateCustomerRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateCustomerVariables): MutationRef<CreateCustomerData, CreateCustomerVariables>;
}
export const createCustomerRef: CreateCustomerRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createCustomer(dc: DataConnect, vars: CreateCustomerVariables): MutationPromise<CreateCustomerData, CreateCustomerVariables>;

interface CreateCustomerRef {
  ...
  (dc: DataConnect, vars: CreateCustomerVariables): MutationRef<CreateCustomerData, CreateCustomerVariables>;
}
export const createCustomerRef: CreateCustomerRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createCustomerRef:
```typescript
const name = createCustomerRef.operationName;
console.log(name);
```

### Variables
The `CreateCustomer` mutation requires an argument of type `CreateCustomerVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateCustomerVariables {
  firstName: string;
  lastName: string;
  email: string;
  address?: string | null;
  phone?: string | null;
  createdAt: TimestampString;
}
```
### Return Type
Recall that executing the `CreateCustomer` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateCustomerData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateCustomerData {
  customer_insert: Customer_Key;
}
```
### Using `CreateCustomer`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createCustomer, CreateCustomerVariables } from '@dataconnect/generated';

// The `CreateCustomer` mutation requires an argument of type `CreateCustomerVariables`:
const createCustomerVars: CreateCustomerVariables = {
  firstName: ..., 
  lastName: ..., 
  email: ..., 
  address: ..., // optional
  phone: ..., // optional
  createdAt: ..., 
};

// Call the `createCustomer()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createCustomer(createCustomerVars);
// Variables can be defined inline as well.
const { data } = await createCustomer({ firstName: ..., lastName: ..., email: ..., address: ..., phone: ..., createdAt: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createCustomer(dataConnect, createCustomerVars);

console.log(data.customer_insert);

// Or, you can use the `Promise` API.
createCustomer(createCustomerVars).then((response) => {
  const data = response.data;
  console.log(data.customer_insert);
});
```

### Using `CreateCustomer`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createCustomerRef, CreateCustomerVariables } from '@dataconnect/generated';

// The `CreateCustomer` mutation requires an argument of type `CreateCustomerVariables`:
const createCustomerVars: CreateCustomerVariables = {
  firstName: ..., 
  lastName: ..., 
  email: ..., 
  address: ..., // optional
  phone: ..., // optional
  createdAt: ..., 
};

// Call the `createCustomerRef()` function to get a reference to the mutation.
const ref = createCustomerRef(createCustomerVars);
// Variables can be defined inline as well.
const ref = createCustomerRef({ firstName: ..., lastName: ..., email: ..., address: ..., phone: ..., createdAt: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createCustomerRef(dataConnect, createCustomerVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.customer_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.customer_insert);
});
```

## UpdateRepairTicketStatus
You can execute the `UpdateRepairTicketStatus` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateRepairTicketStatus(vars: UpdateRepairTicketStatusVariables): MutationPromise<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;

interface UpdateRepairTicketStatusRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateRepairTicketStatusVariables): MutationRef<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;
}
export const updateRepairTicketStatusRef: UpdateRepairTicketStatusRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateRepairTicketStatus(dc: DataConnect, vars: UpdateRepairTicketStatusVariables): MutationPromise<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;

interface UpdateRepairTicketStatusRef {
  ...
  (dc: DataConnect, vars: UpdateRepairTicketStatusVariables): MutationRef<UpdateRepairTicketStatusData, UpdateRepairTicketStatusVariables>;
}
export const updateRepairTicketStatusRef: UpdateRepairTicketStatusRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateRepairTicketStatusRef:
```typescript
const name = updateRepairTicketStatusRef.operationName;
console.log(name);
```

### Variables
The `UpdateRepairTicketStatus` mutation requires an argument of type `UpdateRepairTicketStatusVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateRepairTicketStatusVariables {
  id: UUIDString;
  status: string;
}
```
### Return Type
Recall that executing the `UpdateRepairTicketStatus` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateRepairTicketStatusData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateRepairTicketStatusData {
  repairTicket_update?: RepairTicket_Key | null;
}
```
### Using `UpdateRepairTicketStatus`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateRepairTicketStatus, UpdateRepairTicketStatusVariables } from '@dataconnect/generated';

// The `UpdateRepairTicketStatus` mutation requires an argument of type `UpdateRepairTicketStatusVariables`:
const updateRepairTicketStatusVars: UpdateRepairTicketStatusVariables = {
  id: ..., 
  status: ..., 
};

// Call the `updateRepairTicketStatus()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateRepairTicketStatus(updateRepairTicketStatusVars);
// Variables can be defined inline as well.
const { data } = await updateRepairTicketStatus({ id: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateRepairTicketStatus(dataConnect, updateRepairTicketStatusVars);

console.log(data.repairTicket_update);

// Or, you can use the `Promise` API.
updateRepairTicketStatus(updateRepairTicketStatusVars).then((response) => {
  const data = response.data;
  console.log(data.repairTicket_update);
});
```

### Using `UpdateRepairTicketStatus`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateRepairTicketStatusRef, UpdateRepairTicketStatusVariables } from '@dataconnect/generated';

// The `UpdateRepairTicketStatus` mutation requires an argument of type `UpdateRepairTicketStatusVariables`:
const updateRepairTicketStatusVars: UpdateRepairTicketStatusVariables = {
  id: ..., 
  status: ..., 
};

// Call the `updateRepairTicketStatusRef()` function to get a reference to the mutation.
const ref = updateRepairTicketStatusRef(updateRepairTicketStatusVars);
// Variables can be defined inline as well.
const ref = updateRepairTicketStatusRef({ id: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateRepairTicketStatusRef(dataConnect, updateRepairTicketStatusVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.repairTicket_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.repairTicket_update);
});
```

