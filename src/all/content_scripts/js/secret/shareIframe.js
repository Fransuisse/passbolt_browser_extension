/**
 * Secret share iframe control.
 *
 * It has for aim to control the secret share dialog iframe.
 *  - Add the iframe to the application page. The secretShareDialogPagemod
 *    will detect it and will control its DOM.
 *
 * @copyright (c) 2017 Passbolt SARL
 * @licence GNU Affero General Public License http://www.gnu.org/licenses/agpl-3.0.en.html
 */

$(function () {

  /**
   * Insert the secret share iframe into the share password dialog provided
   * by the application page.
   */
  var _insertIframes = function () {
    // The component managing the autocomplete field.
    var iframeId = 'passbolt-iframe-password-share';
		var iframeUrl = chrome.runtime.getURL('data/' + iframeId +'.html') + '?passbolt=' + iframeId;
    var $iframeShare = $('<iframe/>', {
      id: iframeId,
      src: iframeUrl,
      class: 'loading',
      frameBorder: 0,
      marginwidth: 0,
      marginheight: 0,
      hspace: 0,
      vspace: 0
    });
    $iframeShare.prependTo('.js_plugin_share_wrapper');


    // The component managing the autocomplete result list.
    iframeId = 'passbolt-iframe-password-share-autocomplete';
		iframeUrl = chrome.runtime.getURL('data/' + iframeId +'.html') + '?passbolt=' + iframeId;
    var $iframeAutocomplete = $('<iframe/>', {
      id: iframeId,
      src: iframeUrl,
      class: 'hidden',
      frameBorder: 0,
      marginwidth: 0,
      marginheight: 0,
      hspace: 0,
      vspace: 0,
      style: 'margin-top:-12px' // compensate for iframe padding issue (not present in styleguide
    });
    $iframeAutocomplete.appendTo($('#passbolt-password-share-autocomplete-wrapper', '.js_plugin_share_wrapper'));
  };

  /*
   * Open the secret share control component when a password is shared.
   * passbolt.plugin.resource_share
   */
  window.addEventListener("passbolt.plugin.resource_share", function (event) {
    var data = event.detail;

    // Initialize the process.
    passbolt.request('passbolt.app.share-password-init', {
      resourceId: data.resourceId,
      armored: data.armored
    }).then(function () {
      _insertIframes();
    });
  }, false);

});
undefined; // result must be structured-clonable data