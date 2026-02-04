const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'hojaservice-app',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

const createCustomerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateCustomer', inputVars);
}
createCustomerRef.operationName = 'CreateCustomer';
exports.createCustomerRef = createCustomerRef;

exports.createCustomer = function createCustomer(dcOrVars, vars) {
  return executeMutation(createCustomerRef(dcOrVars, vars));
};

const getRepairTicketsByCustomerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetRepairTicketsByCustomer', inputVars);
}
getRepairTicketsByCustomerRef.operationName = 'GetRepairTicketsByCustomer';
exports.getRepairTicketsByCustomerRef = getRepairTicketsByCustomerRef;

exports.getRepairTicketsByCustomer = function getRepairTicketsByCustomer(dcOrVars, vars) {
  return executeQuery(getRepairTicketsByCustomerRef(dcOrVars, vars));
};

const updateRepairTicketStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateRepairTicketStatus', inputVars);
}
updateRepairTicketStatusRef.operationName = 'UpdateRepairTicketStatus';
exports.updateRepairTicketStatusRef = updateRepairTicketStatusRef;

exports.updateRepairTicketStatus = function updateRepairTicketStatus(dcOrVars, vars) {
  return executeMutation(updateRepairTicketStatusRef(dcOrVars, vars));
};

const listAllDevicesRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListAllDevices');
}
listAllDevicesRef.operationName = 'ListAllDevices';
exports.listAllDevicesRef = listAllDevicesRef;

exports.listAllDevices = function listAllDevices(dc) {
  return executeQuery(listAllDevicesRef(dc));
};
