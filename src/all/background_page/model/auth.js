/**
 * Auth model.
 *
 * @copyright (c) 2017 Passbolt SARL
 * @licence GNU Affero General Public License http://www.gnu.org/licenses/agpl-3.0.en.html
 */
var __ = require('../sdk/l10n').get;
var User = require('./user').User;
var Keyring = require('./keyring').Keyring;
var Crypto = require('./crypto').Crypto;
var GpgAuthToken = require('./gpgAuthToken').GpgAuthToken;
var GpgAuthHeader = require('./gpgAuthHeader').GpgAuthHeader;

/**
 * GPGAuth authentication
 * @constructor
 */
var Auth = function () {
  this.URL_VERIFY = '/auth/verify.json?api-version=v1'; // @TODO get from server http headers
  this.URL_LOGIN = '/auth/login.json?api-version=v1';
  this._verifyToken = undefined;
  this.keyring = new Keyring();
};

/**
 * Verify the server identify
 *
 * @param serverUrl {string} The server url
 * @param serverKey {string} The server public armored key or keyid
 * @param userFingerprint {string} The user finger print
 * @returns {Promise}
 */
Auth.prototype.verify = function(serverUrl, serverKey, userFingerprint) {
  var _this = this,
      user = User.getInstance();

  return new Promise (function(resolve, reject) {
    // if the server key is not provided get it from the settings
    if (typeof serverKey === 'undefined') {
      serverKey = Crypto.uuid(user.settings.getDomain());
    }
    if (typeof serverUrl === 'undefined') {
      serverUrl = user.settings.getDomain();
    }
    if (typeof userFingerprint === 'undefined') {
      var keyring = new Keyring(),
          privateKey = keyring.findPrivate();
      userFingerprint = privateKey.fingerprint;
    }

    var crypto = new Crypto();
    crypto.encrypt(_this.__generateVerifyToken(), serverKey)
      .then(
        function success(encrypted) {
          var data = new FormData();
          data.append('data[gpg_auth][keyid]', userFingerprint);
          data.append('data[gpg_auth][server_verify_token]', encrypted);

          return fetch(
            serverUrl + _this.URL_VERIFY, {
              method: 'POST',
              credentials: 'include',
              body: data
            });
        },
        function error(error) {
          reject(new Error(__('Unable to encrypt the verify token.') + ' ' + error.message));
        }
      )
      .then(function(response) {
        // Check response status
        if(!response.ok) {
          response.json().then(function(json) {
            if (typeof json.header !== 'undefined') {
              reject(new Error(json.header.message));
            } else {
              var error_msg = __('Server request failed without providing additional information.') + ' (' + response.status + ')';
              reject(new Error(error_msg))
            }
          });
        } else {
          var auth = new GpgAuthHeader(response.headers, 'verify');

          // Check that the server was able to decrypt the token with our local copy
          var verify = new GpgAuthToken(auth.headers['x-gpgauth-verify-response']);
          if(verify.token !== _this._verifyToken) {
            reject(new Error(__('The server was unable to prove it can use the advertised OpenPGP key.')));
          } else {
            resolve(__('The server key is verified. The server can use it to sign and decrypt content.'));
          }
        }
      })
      .catch(function(error) {
        reject(error);
      });
  });
};

/**
 * Get Server key for GPG auth.
 *
 * @param domain {string} domain where to get the key. if domain is not
 *  provided, then look in the settings.
 *
 * @returns {Promise}
 */
Auth.prototype.getServerKey = function (domain) {
  var user = User.getInstance(),
    _this = this;
  return new Promise (function(resolve, reject) {

    if (typeof domain === 'undefined') {
      domain = user.settings.getDomain();
    }
    fetch(
      domain + _this.URL_VERIFY, {
        method: 'GET',
        credentials: 'include'
      })
      .then(function (response) {
        _this.__statusCheck(response);
        return response.json();
      })
      .then(
        function success(json) {
          resolve(json.body);
        },
        function error() {
          reject(new Error(__('There was a problem trying to understand the data provided by the server')));
        }
      )
      .catch(function (error) {
        reject(error);
      });
  });
};

/**
 * GPGAuth Login - handle stage1, stage2 and complete
 *
 * @param passphrase {string} The user private key passphrase
 * @returns {Promise} referrer url
 */
Auth.prototype.login = async function(passphrase) {
    await this.keyring.checkPassphrase(passphrase);
    const userAuthToken = await this.stage1(passphrase);
    return await this.stage2(userAuthToken);
};

/**
 * GPGAuth stage1 - get and decrypt a verification given by the server
 *
 * @param passphrase {string} The user private key passphrase
 * @returns {Promise}
 * @private
 */
Auth.prototype.stage1 = async function (passphrase) {

  // Prepare request data
  const body = new FormData();
  body.append('data[gpg_auth][keyid]', this.keyring.findPrivate().fingerprint);
  const data = {
    method: 'POST',
    credentials: 'include',
    body: body
  };
  const url = User.getInstance().settings.getDomain() + this.URL_LOGIN;

  // Send request token to the server
  const response = await fetch(url, data);
  if (!response.ok) {
    return this.onResponseError(response);
  }

  // Check headers
  const auth = new GpgAuthHeader(response.headers, 'stage1');

  // Try to decrypt the User Auth Token
  const crypto = new Crypto();
  const encryptedUserAuthToken = stripslashes(urldecode(auth.headers['x-gpgauth-user-auth-token']));
  let userAuthToken = await crypto.decrypt(encryptedUserAuthToken, passphrase);

  // Validate the User Auth Token
  let authToken = new GpgAuthToken(userAuthToken);
  return authToken.token;
};

/**
 * Stage 2. send back the token to the server to get auth cookie
 *
 * @param userAuthToken {string} The user authentication token
 * @returns {Promise}
 * @private
 */
Auth.prototype.stage2 = function (userAuthToken) {
  var _this = this,
    user = User.getInstance(),
    keyring = new Keyring();

  return new Promise (function(resolve, reject) {
    var data = new FormData();
    data.append('data[gpg_auth][keyid]', (keyring.findPrivate()).fingerprint);
    data.append('data[gpg_auth][user_token_result]', userAuthToken);

    fetch(
      user.settings.getDomain() + _this.URL_LOGIN, {
        method: 'POST',
        credentials: 'include',
        body: data
      })
      .then(function (response) {
        // Check response status
        if (!response.ok) {
          return _this.onResponseError(response);
        }
        var auth = new GpgAuthHeader(response.headers, 'complete');

        // Get the redirection url
        var referrer = user.settings.getDomain() + auth.headers['x-gpgauth-refer'];
        resolve(referrer);
      })
      .catch(function (error) {
        reject(error);
      });
  });
};

/**
 * Generate random verification token to be decrypted by the server
 *
 * @returns {string}
 */
Auth.prototype.__generateVerifyToken = function() {
  var t = new GpgAuthToken();
  this._verifyToken = t.token;
  return this._verifyToken;
};

/**
 * Check if the HTTP status is OK.
 *
 * @param status {int} The http status
 * @returns {boolean}
 * @throw Exception if the status is not OK
 */
Auth.prototype.__statusCheck = function(response) {
  if(!response.ok) {
    var msg = __('There was a problem when trying to communicate with the server') + ' (HTTP Code:' + response.status +')';
    throw new Error(msg);
  }
  return true;
};

/**
 * Handle the creation of an error when response status is no ok
 *
 * @param response {object}
 * @returns Promise that will throw the appropriate exception
 */
Auth.prototype.onResponseError = function (response) {
  var error_msg = __('There was a server error. No additional information provided') + ' (' + response.status + ')';
  return response.json().then(function (json) {
    if (typeof json.header !== 'undefined') {
      throw new Error(json.header.message);
    } else {
      throw new Error(error_msg);
    }
  }, function error() {
    throw new Error(error_msg);
  })
};

// Exports the Authentication model object.
exports.Auth = Auth;