/* global MocksHelper, MockNavigatormozSetMessageHandler,
   MockNavigatorGetDeviceStorage,  MockL10n, MockBluetooth,
   BluetoothTransfer, MockNotificationHelper, MockUtilityTray,
   NotificationHelper, MockCustomDialog, MimeMapper, mockMozActivityInstance*/
'use strict';

require('/shared/test/unit/mocks/mock_navigator_moz_set_message_handler.js');
require('/shared/test/unit/mocks/mock_event_target.js');
require('/shared/test/unit/mocks/mock_dom_request.js');
require('/test/unit/mock_navigator_get_device_storage.js');
require('/test/unit/mock_bluetooth.js');
require('/shared/test/unit/mocks/mock_l10n.js');
require('/shared/test/unit/mocks/mock_notification_helper.js');
require('/shared/test/unit/mocks/mock_custom_dialog.js');
require('/shared/js/mime_mapper.js');
require('/test/unit/mock_utility_tray.js');
require('/test/unit/mock_nfc_handover_manager.js');
require('/test/unit/mock_activity.js');
require('/shared/test/unit/mocks/mock_service.js');

var mocksForBluetoothTransfer = new MocksHelper([
  'Bluetooth',
  'NotificationHelper',
  'CustomDialog',
  'MozActivity',
  'UtilityTray',
  'Service'
]).init();

suite('system/bluetooth_transfer', function() {
  mocksForBluetoothTransfer.attachTestHelpers();

  var realSetMessageHandler;
  var realNavigatorGetDeviceStorage;
  var realL10n;
  var real_sendingFilesQueue;

  var fake_sendingFilesQueue;

  suiteSetup(function(done) {
    realSetMessageHandler = navigator.mozSetMessageHandler;
    navigator.mozSetMessageHandler = MockNavigatormozSetMessageHandler;

    realNavigatorGetDeviceStorage = navigator.getDeviceStorage;
    navigator.getDeviceStorage = MockNavigatorGetDeviceStorage;

    realL10n = navigator.mozL10n;
    navigator.mozL10n = MockL10n;

    MockNavigatormozSetMessageHandler.mSetup();

    requireApp('system/js/bluetooth_transfer.js', done);
  });

  suiteTeardown(function() {
    MockNavigatormozSetMessageHandler.mTeardown();
    navigator.mozSetMessageHandler = realSetMessageHandler;
    navigator.getDeviceStorage = realNavigatorGetDeviceStorage;
    navigator.mozL10n = realL10n;
  });

  suite('UI', function() {
    suite('getDeviceName', function() {
      var address = 'AA:BB:CC:00:11:22';
      var spyGetConnectedDevices;
      setup(function() {
        spyGetConnectedDevices =
          this.sinon.spy(MockBluetooth.defaultAdapter, 'getConnectedDevices');
      });

      teardown(function() {
        spyGetConnectedDevices.reset();
      });

      suite('cannot get adapter ', function() {
        setup(function() {
          this.sinon.stub(MockBluetooth, 'getAdapter').returns(null);
        });

        test('should return unknown device name ', function(done) {
          BluetoothTransfer.getDeviceName(address).then(function(deviceName) {
            assert.isFalse(spyGetConnectedDevices.called);
            assert.equal(deviceName, 'unknown-device');
          }).then(done, done);
        });
      });

      suite('request getConnectedDevices() onerror ', function() {
        test('should return unknown device name ', function(done) {
          BluetoothTransfer.getDeviceName(address).then(function(deviceName) {
            assert.isTrue(spyGetConnectedDevices.called);
            assert.equal(deviceName, 'unknown-device');
          }).then(done, done);

          var connectedDevicesReq =
            spyGetConnectedDevices.getCall(0).returnValue;
          connectedDevicesReq.fireError(null);
        });
      });

      suite('request getConnectedDevices() onsuccess ' +
        'without any devices ', function() {
        var mockConnectedDevices = null;
        test('should return unknown device name ', function(done) {
          BluetoothTransfer.getDeviceName(address).then(function(deviceName) {
            assert.isTrue(spyGetConnectedDevices.called);
            assert.equal(deviceName, 'unknown-device');
          }).then(done, done);

          var connectedDevicesReq =
            spyGetConnectedDevices.getCall(0).returnValue;
          connectedDevicesReq.readyState = 'pending';
          connectedDevicesReq.fireSuccess(mockConnectedDevices);
        });
      });

      suite('request getConnectedDevices() onsuccess ' +
        'with responding device ', function() {
        var mockConnectedDevices =
          [{name: 'device-No1',
            address: '00:11:22:AA:BB:CC'},
          {name: 'device-No2',
          address: 'AA:BB:CC:00:11:22'}];

        test('should return responding device name ', function(done) {
          BluetoothTransfer.getDeviceName(address).then(function(deviceName) {
            assert.isTrue(spyGetConnectedDevices.called);
            assert.equal(deviceName, 'device-No2');
          }).then(done, done);

          var connectedDevicesReq =
            spyGetConnectedDevices.getCall(0).returnValue;
          connectedDevicesReq.readyState = 'pending';
          connectedDevicesReq.fireSuccess(mockConnectedDevices);
        });
      });
    });

    suite('humanizeSize', function() {
      test('should handle zero size ', function() {
        var expectedSize = 'fileSize{"size":"0.00","unit":"byteUnit-B"}';
        assert.equal(expectedSize, BluetoothTransfer.humanizeSize(0));
      });

      test('should handle bytes size ', function() {
        var expectedSize = 'fileSize{"size":"42.00","unit":"byteUnit-B"}';
        assert.equal(expectedSize, BluetoothTransfer.humanizeSize(42));
      });

      test('should handle kilobytes size ', function() {
        var expectedSize = 'fileSize{"size":"1.00","unit":"byteUnit-KB"}';
        assert.equal(expectedSize, BluetoothTransfer.humanizeSize(1024));
      });

      test('should handle megabytes size ', function() {
        var expectedSize = 'fileSize{"size":"4.67","unit":"byteUnit-MB"}';
        assert.equal(expectedSize, BluetoothTransfer.humanizeSize(4901024));
      });

      test('should handle gigabytes size ', function() {
        var expectedSize = 'fileSize{"size":"3.73","unit":"byteUnit-GB"}';
        assert.equal(expectedSize, BluetoothTransfer.humanizeSize(4000901024));
      });
    });

    suite('operate sending files queue ', function() {
      suiteSetup(function() {
        real_sendingFilesQueue = BluetoothTransfer._sendingFilesQueue;
        fake_sendingFilesQueue = [{
          numberOfFiles: 1,
          numSuccessful: 0,
          numUnsuccessful: 0
        }];
        BluetoothTransfer._sendingFilesQueue = fake_sendingFilesQueue;
      });

      suiteTeardown(function() {
        BluetoothTransfer._sendingFilesQueue = real_sendingFilesQueue;
      });

      test('push sending files request in queue, then create notification ',
        function() {
        var sendingFilesSchedule = {
          numberOfFiles: 2,
          numSuccessful: 0,
          numUnsuccessful: 0
        };
        var evt = {
          detail: sendingFilesSchedule
        };
        var title = 'transfer-has-started-title';
        BluetoothTransfer._onFilesSending(evt);
        assert.equal(2, BluetoothTransfer._sendingFilesQueue.length);
        assert.equal(MockNotificationHelper.mTitleL10n, title);
      });

      test('received onTransferComplete callback for received task, ' +
           'should be ignored.. ', function() {
        var transferInfo = {
          received: true,
          success: true
        };
        BluetoothTransfer.summarizeSentFilesReport(transferInfo);
        assert.equal(2, BluetoothTransfer._sendingFilesQueue.length);
        assert.equal(MockNotificationHelper.mTitleL10n, null);
      });

      test('received onTransferComplete callback for the first sent task, ' +
           'should remove the tast from queue.. ', function() {
        var transferInfo = {
          received: false,
          success: true
        };
        BluetoothTransfer.summarizeSentFilesReport(transferInfo);
        assert.equal(1, BluetoothTransfer._sendingFilesQueue.length);
        assert.equal(MockNotificationHelper.mTitleL10n, null);
      });

      test('received onTransferComplete callback for the second sent task' +
           ' --> first file, should record success/fail report in queue.. ',
           function() {
        var transferInfo = {
          received: false,
          success: false
        };
        BluetoothTransfer.summarizeSentFilesReport(transferInfo);
        assert.equal(1, BluetoothTransfer._sendingFilesQueue.length);
        assert.equal(1,
          BluetoothTransfer._sendingFilesQueue[0].numUnsuccessful);

        assert.equal(MockNotificationHelper.mTitleL10n, null);
      });

      test('received onTransferComplete callback for the second sent task' +
           ' --> the second file, should remove the tast from queue. Then, ' +
           'create a report in notification.. ', function() {
        var transferInfo = {
          received: false,
          success: true
        };
        var title = 'transferReport-title';
        var body = {
          id: 'transferReport-description',
          args: {'numSuccessful' : 1, 'numUnsuccessful' : 1}
        };

        BluetoothTransfer.summarizeSentFilesReport(transferInfo);
        assert.equal(0, BluetoothTransfer._sendingFilesQueue.length);
        assert.equal(MockNotificationHelper.mTitleL10n, title);
        assert.equal(MockNotificationHelper.mOptions.bodyL10n.id, body.id);
        assert.deepEqual(
          MockNotificationHelper.mOptions.bodyL10n.args, body.args);
      });
    });

    suite('confirmation, decline, accept, and storage check', function() {
      test('receivingFileConfirmation', function() {
        var stubGetDeviceName =
          this.sinon.stub(BluetoothTransfer, 'getDeviceName', function() {
          return Promise.resolve('nameName');
        });

        var stubMockUtilityTrayHide =
          this.sinon.stub(MockUtilityTray, 'hide');
        var stubShowReceivePrompt =
          this.sinon.stub(BluetoothTransfer, 'showReceivePrompt');
        var evt = {
          address: 'AA:BB:CC:00:11:22',
          fileLength: 1048000
        };
        BluetoothTransfer.onReceivingFileConfirmation(evt);
        assert.isTrue(stubGetDeviceName.calledWith(evt.address));
        stubGetDeviceName().then(function() {
          assert.deepEqual(
            MockNotificationHelper.mTitleL10n,
            {id: 'transfer-confirmation-title', args: {deviceName: 'nameName'}}
          );
          assert.equal(
            MockNotificationHelper.mOptions.bodyL10n,
            'transfer-confirmation-description'
          );
          assert.equal(
            MockNotificationHelper.mOptions.icon,
            'style/bluetooth_transfer/images/icon_bluetooth.png'
          );
          NotificationHelper.mEmit('click');
          assert.isTrue(stubMockUtilityTrayHide.called);
          assert.isTrue(stubShowReceivePrompt.called);
          MockNotificationHelper.mTeardown();
        });
      });

      test('declineReceive', function() {
        var spyConfirmReceivingFile =
          this.sinon.spy(MockBluetooth.defaultAdapter, 'confirmReceivingFile');

        BluetoothTransfer.declineReceive('AA:BB:CC:00:22:33');

        assert.isFalse(MockCustomDialog.mShown);
        assert.isTrue(
          spyConfirmReceivingFile.calledWith('AA:BB:CC:00:22:33', false)
        );

        spyConfirmReceivingFile.reset();

        this.sinon.stub(MockBluetooth, 'getAdapter').returns(null);

        BluetoothTransfer.declineReceive('AA:BB:CC:00:22:33');
        assert.isFalse(spyConfirmReceivingFile.called);

        MockCustomDialog.mTeardown();
      });

      test('acceptReceive', function() {
        var evt = {
          address: 'AA:BB:CC:00:11:24',
          fileLength: 1048500
        };
        var stubCheckStorageSpace =
          this.sinon.stub(BluetoothTransfer, 'checkStorageSpace');
        var stubShowStorageUnavailablePrompt =
          this.sinon.stub(BluetoothTransfer, 'showStorageUnavaliablePrompt');
        var spyConfirmReceivingFile =
          this.sinon.spy(MockBluetooth.defaultAdapter, 'confirmReceivingFile');

        BluetoothTransfer.acceptReceive(evt);

        assert.isFalse(MockCustomDialog.mShown);

        assert.isTrue(stubCheckStorageSpace.calledWith(evt.fileLength));
        stubCheckStorageSpace.getCall(0).args[1](true, 'somemsg');
        assert.isTrue(
          spyConfirmReceivingFile.calledWith(evt.address, true)
        );

        spyConfirmReceivingFile.reset();
        stubCheckStorageSpace.getCall(0).args[1](false, 'somemsg2');
        assert.isTrue(
          spyConfirmReceivingFile.calledWith(evt.address, false)
        );
        assert.isTrue(stubShowStorageUnavailablePrompt.calledWith('somemsg2'));

        spyConfirmReceivingFile.reset();
        this.sinon.stub(MockBluetooth, 'getAdapter').returns(null);
        stubCheckStorageSpace.getCall(0).args[1](false, 'somemsg3');
        assert.isFalse(spyConfirmReceivingFile.called);

        MockCustomDialog.mTeardown();
      });

      test('showStorageUnavaliablePrompt', function() {
        MockCustomDialog.mTeardown();

        BluetoothTransfer.showStorageUnavaliablePrompt('message');

        assert.equal(
          MockCustomDialog.mShowedTitle,
          'cannotReceiveFile'
        );
        assert.equal(
          MockCustomDialog.mShowedMsg,
          'message'
        );
        assert.isTrue(MockCustomDialog.mShown);

        assert.equal(
          MockCustomDialog.mShowedCancel.title,
          'confirm'
        );
        MockCustomDialog.mShowedCancel.callback();
        assert.isFalse(MockCustomDialog.mShown);

        MockCustomDialog.mTeardown();
      });

      test('checkStorageSpace', function() {
        var spyCb = this.sinon.spy();
        var mockDeviceStorage = MockNavigatorGetDeviceStorage();
        var spyAvailable = this.sinon.spy(mockDeviceStorage, 'available');
        var spyFreeSpace = this.sinon.spy(mockDeviceStorage, 'freeSpace');

        BluetoothTransfer.checkStorageSpace(10240, spyCb);

        assert.isTrue(spyAvailable.called);
        var availreq = spyAvailable.getCall(0).returnValue;

        availreq.fireError(null);
        assert.isTrue(spyCb.calledWithMatch(
            false,
            'cannotGetStorageState'
        ));
        assert.isFalse(spyFreeSpace.called);
        spyFreeSpace.reset();
        spyCb.reset();

        availreq.readyState = 'pending';
        availreq.fireSuccess('unavailable');
        sinon.assert.calledWithMatch(
          spyCb,
          false,
          'sdcard-not-exist2'
        );
        assert.isFalse(spyFreeSpace.called);
        spyFreeSpace.reset();
        spyCb.reset();

        availreq.readyState = 'pending';
        availreq.fireSuccess('shared');
        sinon.assert.calledWithMatch(spyCb, false, 'sdcard-in-use');
        assert.isFalse(spyFreeSpace.called);
        spyFreeSpace.reset();
        spyCb.reset();

        availreq.readyState = 'pending';
        availreq.fireSuccess('some-default-case');
        sinon.assert.calledWithMatch(spyCb, false, 'unknown-error');
        assert.isFalse(spyFreeSpace.called);
        spyFreeSpace.reset();
        spyCb.reset();

        availreq.readyState = 'pending';
        availreq.fireSuccess('available');
        var freereq = spyFreeSpace.getCall(0).returnValue;
        freereq.fireError();
        assert.isTrue(spyCb.calledWithMatch(
          false,
          'cannotGetStorageState'
        ));
        spyCb.reset();

        freereq.readyState = 'pending';
        freereq.fireSuccess(20480);
        assert.isTrue(spyCb.calledWith(true, ''));
        spyCb.reset();

        freereq.readyState = 'pending';
        freereq.fireSuccess(512);
        assert.isTrue(spyCb.calledWithMatch(
          false,
          'sdcard-no-space2'
        ));
        spyCb.reset();

        spyAvailable.reset();
        BluetoothTransfer.checkStorageSpace(10240, null);
        assert.isFalse(spyAvailable.called);
      });
    });

    suite('openReceivedFile', function() {
      test('until getreq.onsuccess', function() {
        var evt = {
          fileName: 'someFile.txt',
          contentType: 'text/plain'
        };

        var mockDeviceStorage = MockNavigatorGetDeviceStorage();
        var spyGetDeviceStorage = this.sinon.spy(navigator, 'getDeviceStorage');
        var spyGet = this.sinon.spy(mockDeviceStorage, 'get');

        BluetoothTransfer.openReceivedFile(evt);
        assert.isTrue(spyGetDeviceStorage.calledWith('sdcard'));
        assert.isTrue(spyGet.calledWith('Download/Bluetooth/' + evt.fileName));
      });

      test('into getreq.onsuccess', function() {
        var evt = {
          fileName: 'someFile.txt',
          contentType: 'text/plain'
        };

        var mockDeviceStorage = MockNavigatorGetDeviceStorage();
        var spyGet = this.sinon.spy(mockDeviceStorage, 'get');
        BluetoothTransfer.openReceivedFile(evt);

        this.sinon.stub(MimeMapper, 'isSupportedType').returns(false);
        this.sinon.stub(MimeMapper, 'guessTypeFromExtension')
          .returns('text/plain');

        var req = spyGet.getCall(0).returnValue;

        req.fireSuccess({
          name: evt.fileName,
          type: evt.contentType
        });

        assert.equal(mockMozActivityInstance.name, 'open');
        assert.deepEqual(
          mockMozActivityInstance.data,
          {
            type: req.result.type,
            blob: req.result,
            filename: req.result.name
          }
        );

        assert.isFunction(mockMozActivityInstance.onsuccess);
        assert.isFunction(mockMozActivityInstance.onerror);

        var stubMockUtilityTrayHide = this.sinon.stub(MockUtilityTray, 'hide');
        var stubShowUnknownMediaPrompt =
          this.sinon.stub(BluetoothTransfer, 'showUnknownMediaPrompt');

        mockMozActivityInstance.error = {
          name: 'NO_PROVIDER'
        };

        mockMozActivityInstance.onerror(null);

        assert.isTrue(stubMockUtilityTrayHide.called);
        assert.isTrue(stubShowUnknownMediaPrompt.calledWith(req.result.name));

        stubMockUtilityTrayHide.reset();
        stubShowUnknownMediaPrompt.reset();

        mockMozActivityInstance.error = {
            name: 'USER_ABORT'
        };

        mockMozActivityInstance.onerror(null);

        assert.isFalse(stubMockUtilityTrayHide.called);
        assert.isFalse(stubShowUnknownMediaPrompt.calledWith(req.result.name));
      });

      test('getreq.onsuccess with vcard', function() {
        var evt = {
          fileName: 'someCard.vcf',
          contentType: 'text/vcard'
        };

        var mockDeviceStorage = MockNavigatorGetDeviceStorage();
        var spyGet = this.sinon.spy(mockDeviceStorage, 'get');

        BluetoothTransfer.openReceivedFile(evt);

        this.sinon.stub(MimeMapper, 'isSupportedType').returns(true);

        var req = spyGet.getCall(0).returnValue;

        req.fireSuccess({
          name: evt.fileName,
          type: evt.contentType
        });

        assert.equal(mockMozActivityInstance.name, 'import');
        assert.deepEqual(
          mockMozActivityInstance.data,
          {
            type: req.result.type,
            blob: req.result,
            filename: req.result.name
          }
        );

        assert.isFunction(mockMozActivityInstance.onsuccess);
        assert.isFunction(mockMozActivityInstance.onerror);
      });

      test('showUnknownMediaPrompt', function() {
        MockCustomDialog.mTeardown();

        BluetoothTransfer.showUnknownMediaPrompt('theFile.ext');

        assert.deepEqual(
          MockCustomDialog.mShowedTitle,
          'cannotOpenFile'
        );
        assert.deepEqual(
          MockCustomDialog.mShowedMsg,
          {
            id: 'unknownMediaTypeToOpenFile',
            args: {
              fileName: 'theFile.ext'
            }
          }
        );
        assert.isTrue(MockCustomDialog.mShown);

        assert.deepEqual(
          MockCustomDialog.mShowedCancel.title,
          'confirm'
        );
        MockCustomDialog.mShowedCancel.callback();
        assert.isFalse(MockCustomDialog.mShown);

        MockCustomDialog.mTeardown();
      });
    });

    suite('sendFile', function() {
      test('sendFileViaHandover', function() {
        var spySendFile =
          this.sinon.spy(MockBluetooth.defaultAdapter, 'sendFile');
        var stubOnFilesSending =
          this.sinon.stub(BluetoothTransfer, '_onFilesSending');
        var stubSetTimeout = this.sinon.stub(window, 'setTimeout');
        BluetoothTransfer.sendFileViaHandover({
          detail: {
            mac: 'AA:BB:CC:00:11:55',
            blob: 'blahblahblah\0xa0\0xa0blahblahblah'
          }
        });

        assert.isTrue(stubOnFilesSending.called);
        assert.equal(typeof stubOnFilesSending.getCall(0).args[0], 'object');

        assert.isTrue(stubSetTimeout.called);
        assert.isTrue(stubSetTimeout.getCall(0).args[1] > 0);
        stubSetTimeout.getCall(0).args[0]();

        assert.isTrue(
          spySendFile
          .calledWith('AA:BB:CC:00:11:55', 'blahblahblah\0xa0\0xa0blahblahblah')
        );

        this.sinon.stub(MockBluetooth, 'getAdapter').returns(null);
        BluetoothTransfer.sendFileViaHandover({
          detail: {
            mac: 'AA:BB:CC:00:11:66',
            blob: 'blahblahblah\0xa0\0xa0blahblahblahblah'
          }
        });

        stubOnFilesSending.reset();
        assert.isFalse(stubOnFilesSending.called);
      });

      test('onUpdateProgress', function() {
        // mode = start
        var stubInitProgress =
          this.sinon.stub(BluetoothTransfer, 'initProgress');
        var evt = {
          detail: {
            transferInfo: 'info123'
          }
        };

        BluetoothTransfer._onUpdateProgress('start', evt);
        assert.isTrue(stubInitProgress.calledWith('info123'));

        // mode = progress
        var stubUpdateProgress =
          this.sinon.stub(BluetoothTransfer, 'updateProgress');
        evt = {
          address: 'AA:BB:DD:11:22:44',
          processedLength: '1024',
          fileLength: '2048'
        };

        BluetoothTransfer._onUpdateProgress('progress', evt);
        assert.isTrue(
            Math.abs(stubUpdateProgress.getCall(0).args[0]) -
            (evt.processedLength / evt.fileLength) <
            0.00001
        );
        assert.equal(stubUpdateProgress.getCall(0).args[1], evt);

        evt.fileLength = 0;
        BluetoothTransfer._onUpdateProgress('progress', evt);
        assert.isTrue(stubUpdateProgress.calledWith(0, evt));

        evt.fileLength = 1024;
        evt.processedLength = 1000;
        BluetoothTransfer._onUpdateProgress('progress', evt);
        assert.isTrue(stubUpdateProgress.calledWith(0, evt));

        stubUpdateProgress.reset();
      });

      test('onCancelTransferTask', function() {
        var stubMockUtilityTrayHide = this.sinon.stub(MockUtilityTray, 'hide');
        var stubShowCancelTransferPrompt =
          this.sinon.stub(BluetoothTransfer, 'showCancelTransferPrompt');

        BluetoothTransfer.onCancelTransferTask({
          target: {
            dataset: {
              id: 1234
            }
          }
        });

        assert.isTrue(stubMockUtilityTrayHide.called);
        assert.isTrue(stubShowCancelTransferPrompt.calledWith(1234));
      });

      test('showCancelTransferPrompt', function() {
        MockCustomDialog.mTeardown();

        var stubContinueTransfer =
          this.sinon.stub(BluetoothTransfer, 'continueTransfer');
        var stubCancelTransfer =
          this.sinon.stub(BluetoothTransfer, 'cancelTransfer');

        BluetoothTransfer.showCancelTransferPrompt('DD:FE:00:11:22:33');

        assert.isTrue(MockCustomDialog.mShown);
        assert.equal(
          MockCustomDialog.mShowedTitle,
          'cancelFileTransfer'
        );
        assert.equal(
          MockCustomDialog.mShowedMsg,
          'cancelFileTransfer'
        );
        assert.equal(
          MockCustomDialog.mShowedCancel.title,
          'continueFileTransfer'
        );
        assert.equal(
          MockCustomDialog.mShowedConfirm.title,
          'cancel'
        );

        MockCustomDialog.mShowedCancel.callback();
        assert.isTrue(stubContinueTransfer.called);

        MockCustomDialog.mShowedConfirm.callback();
        assert.isTrue(stubCancelTransfer.calledWith('DD:FE:00:11:22:33'));

        MockCustomDialog.mTeardown();
      });

      test('cancelTransfer', function() {
        var spyStopSendingFile =
          this.sinon.spy(MockBluetooth.defaultAdapter, 'stopSendingFile');
        MockCustomDialog.mTeardown();

        BluetoothTransfer.cancelTransfer('CC:DD:00:AA:22:44');

        assert.isFalse(MockCustomDialog.mShown);
        assert.isTrue(spyStopSendingFile.calledWith('CC:DD:00:AA:22:44'));

        this.sinon.stub(MockBluetooth, 'getAdapter').returns(null);

        spyStopSendingFile.reset();

        BluetoothTransfer.cancelTransfer('CC:DD:00:AA:22:44');
        assert.isFalse(spyStopSendingFile.called);

        MockCustomDialog.mTeardown();
      });
    });

    suite('isSendFileQueueEmpty', function() {
      test('True if queue is empty', function() {
        assert.isTrue(BluetoothTransfer.isSendFileQueueEmpty());
      });

      test('False is queue is not empty', function() {
        BluetoothTransfer._sendingFilesQueue.push(1);
        assert.isFalse(BluetoothTransfer.isSendFileQueueEmpty());
        BluetoothTransfer._sendingFilesQueue.splice(0);
      });
    });

    suite('NfcHandoverManager interactions', function() {
      var stubRemoveProgress;
      var stubSummarizeSentFilesReport;

      var transferEvt;

      setup(function() {
        // In this suite, we care about NfcHandoverManager.transferComplete()
        // only.
        stubRemoveProgress = this.sinon.stub(BluetoothTransfer,
          'removeProgress');
        stubSummarizeSentFilesReport = this.sinon.stub(BluetoothTransfer,
          'summarizeSentFilesReport');

        transferEvt = {
          detail: {
            transferInfo: {
              success: true,
              received: false
            }
          }
        };
      });

      teardown(function() {
        stubRemoveProgress.restore();
        stubSummarizeSentFilesReport.restore();
      });

      test('transferComplete() called for NFC originated transfer',
        function() {
        var stubEvent = this.sinon.stub(window, 'dispatchEvent');
        BluetoothTransfer._onTransferComplete(transferEvt);

        assert.equal(stubEvent.firstCall.args[0].type,
          'nfc-transfer-completed');
        assert.deepEqual(stubEvent.firstCall.args[0].detail, {
          viaHandover: false,
          success: true,
          received: false
        });
      });

      test('transferComplete() called for non-NFC originated transfer',
        function() {
        var stubEvent = this.sinon.stub(window, 'dispatchEvent');
        BluetoothTransfer._sendingFilesQueue.push({
          viaHandover: true
        });
        BluetoothTransfer._onTransferComplete(transferEvt);

        assert.deepEqual(stubEvent.firstCall.args[0].detail, {
          viaHandover: true,
          success: true,
          received: false
        });
      });
    });
  });
});
