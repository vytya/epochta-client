/**
 * @module epochta-client
 */

const helpers = require('./helpers');
const errors = require('./errors');
const APIMethodsInterface = require('./api-methods');

/**
 * Simplified HTTP request client
 * @external
 * @see {@link https://github.com/request/request Request module}
 */
const request = require('request');

/**
 * @typedef {Object} Options
 * @property {boolean} [testMode=false] - if ```true``` - performs requests in API test mode and allows to use custom methods
 * @property {Object} [request] - HTTP request parameters
 * @property {string} [request.method=POST] - HTTP request method for API requests
 * @property {string} [request.baseUrl=http://api.myatompark.com/sms/3.0/] - Base url for API requests
 * @property {string} [request.apiVersion=3.0] - API version
 * @property {number} [request.correctResponseStatusCode=200]
 * @private
 */

/**
 * Options container
 * @type {module:epochta-client~Options}
 * @private
 */
const config = {
  testMode: false,
  request: {
    method: 'POST',
    baseUrl: 'https://api.myatompark.com/sms/3.0/',
    apiVersion: '3.0',
    correctResponseStatusCode: 200,
  },
};

/**
 * API Client instance
 * @type {module:epochta-client.APIClient}
 * @private
 */
let apiClientInstance = null;

/**
 * API keys provided by ePochta SMS service
 * @typedef {Object} APIKeys
 * @property {string} publicKey - public API key
 * @property {string} privateKey - private API key
 */

/**
 * API keys container
 * @type {module:epochta-client~APIKeys}
 * @private
 */
const apiKeys = {
  publicKey: '',
  privateKey: '',
};

/**
 * @static
 * @class
 * @classdesc Singleton constructor of API Client creates new instance or returns existing if has one.
 * Implements all methods of {@link module:epochta-client~APIMethodsInterface APIMethodsInterface}
 * @implements {module:epochta-client~APIMethodsInterface}
 * @param {module:epochta-client~APIKeys} keys - API keys provided by ePochta SMS service
 * @param {boolean} [isTestMode=false] - if 'true' adds argument test=1 to each API request and allows custom request methods
 */
const APIClient = function(keys, isTestMode) {
  if (!apiClientInstance) {
    // checks for provided keys
    if (!keys ||
        !keys.hasOwnProperty('publicKey') ||
        !keys.hasOwnProperty('privateKey')) {
      throw new Error('provide publicKey and privateKey');
    }
    if (isTestMode) {
      config.testMode = true;
    }
    Object.assign(apiKeys, keys);
    Object.freeze(apiKeys);
    // implements methods of APIMethodsInterface through proxy
    apiClientInstance = new Proxy(APIMethodsInterface, clientHandler);
  }
  return apiClientInstance;
};

/**
 * Placeholder object which contains traps
 * @type {object}
 * @private
 */
const clientHandler = {};

/**
 * Method that provide property access on getting property or method
 * @param {object} target Object which the proxy virtualizes
 * @param {string} methodName The name of the property/method to get.
 * @return {Proxy} Proxy for virtualization all method calls
 * @private
 */
clientHandler.get = function getTrap(target, methodName) {
  let method;
  // checks availability of called method in API if not in test mode
  if (!config.testMode) {
    if (!target[methodName] && typeof target[methodName] !== 'function') {
      throw new Error(`${methodName} method doesn't exist in API`);
    }
    method = target[methodName];
  } else {
    // empty anonymous function with name = methodName
    method = new Proxy(new Function(), {
      get: function() {
        return methodName;
      },
    });
  }
  return new Proxy(method, clientMethodsHandler);
};

/**
 * Placeholder object which contains traps
 * @type {object}
 * @private
 */
const clientMethodsHandler = {};

/**
 * Trap for APIMethodsInterface methods call
 * @param {function} targetMethod Method of APIMethodsInterface which has been called
 * @param {object} thisArg The this argument for the call
 * @param {Array} args The list of arguments for the call.
 * @return {Promise}
 * @private
 */
clientMethodsHandler.apply = function applyTrap(targetMethod, thisArg, args) {
  const apiRequestArguments = args[0];
  // checks for provided arguments
  if(!apiRequestArguments || typeof apiRequestArguments != 'object') {
    throw new Error('No arguments provided');
  }
  // checks for availability of required arguments with default APIMethodsInterface method
  if (!config.testMode && !targetMethod(apiRequestArguments)) {
    throw new Error('Some required arguments are missing');
  }
  // checks for test mode
  if (config.testMode) {
    apiRequestArguments.test = 1;
  }
  // API request arguments assembly
  apiRequestArguments.key = apiKeys.publicKey;
  const tempArgs = {};
  Object.assign(tempArgs, apiRequestArguments);
  tempArgs.version = config.request.apiVersion;
  tempArgs.action = targetMethod.name;
  apiRequestArguments.sum = helpers.checksum(tempArgs, apiKeys.privateKey);
  // API HTTP request
  return new Promise(function(resolve, reject) {
    request({
      method: config.request.method,
      baseUrl: config.request.baseUrl,
      uri: targetMethod.name,
      form: apiRequestArguments,
      json: true,
    }, function(error, response, body) {
      // checks for error returned from external:request
      if (error) {
        return reject(error);
      }
      // checks for correct response code
      if (response &&
          response.statusCode !== config.request.correctResponseStatusCode) {
        return reject(new errors.ResponseCodeError(response.statusCode));
      }
      // checks for api errors
      if (body && body.error) {
        return reject(new errors.APIError(body.code, body.error));
      }
      resolve(body ? helpers.parseResult(body.result) : null);
    });
  });
};

APIClient.errors = errors;
module.exports = APIClient;
