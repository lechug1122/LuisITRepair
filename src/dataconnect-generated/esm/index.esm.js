import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'hojaservice-app',
  location: 'us-east4'
};

export const createCustomerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateCustomer', inputVars);
}
createCustomerRef.operationName = 'CreateCustomer';

export function createCustomer(dcOrVars, vars) {
  return executeMutation(createCustomerRef(dcOrVars, vars));
}

export const getRepairTicketsByCustomerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetRepairTicketsByCustomer', inputVars);
}
getRepairTicketsByCustomerRef.operationName = 'GetRepairTicketsByCustomer';

export function getRepairTicketsByCustomer(dcOrVars, vars) {
  return executeQuery(getRepairTicketsByCustomerRef(dcOrVars, vars));
}

export const updateRepairTicketStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateRepairTicketStatus', inputVars);
}
updateRepairTicketStatusRef.operationName = 'UpdateRepairTicketStatus';

export function updateRepairTicketStatus(dcOrVars, vars) {
  return executeMutation(updateRepairTicketStatusRef(dcOrVars, vars));
}

export const listAllDevicesRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListAllDevices');
}
listAllDevicesRef.operationName = 'ListAllDevices';

export function listAllDevices(dc) {
  return executeQuery(listAllDevicesRef(dc));
}

