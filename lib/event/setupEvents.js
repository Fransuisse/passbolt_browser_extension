/**
 * Setup Events
 * Listen to events related to the setup
 */
var Setup = require('../model/setup');
var app = require('../main');

var listen = function (worker) {

    // Init / Reset the setup. (delete config, flush keyring, etc..)
    worker.port.on('passbolt.setup.init', function(token) {
        Setup.reset();
        worker.port.emit('passbolt.setup.init.complete', token, 'SUCCESS');
    });

    // The setup has been completed, save the information
    worker.port.on('passbolt.setup.save', function(token, data) {
        Setup.save(data)
            .then(function() {
                // Destroy the passbolt application pageMod.
                app.pageMods.passboltApp.destroy();
                // And restart it to make it able to be initialized regarding the variables we gathered during the setup.
                app.initPassboltAppPageMod();
                worker.port.emit('passbolt.setup.save.complete', token, 'SUCCESS');
            });
    });
};
exports.listen = listen;