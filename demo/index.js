var rcObj = rcObj || {};

(function($, window) {

    rcObj.credentials = {
        "server": "https://platform.devtest.ringcentral.com",
        "appKey": "",
        "appSecret": "",
        "login": "",
        "ext": "101",
        "password": "",
        "logLevel": 0,        
    },

    rcObj.vars = {
        sdk: null,
        platform: null,
        webPhone: null,
        logLevel: 0,
        username: null,
        extension: null,
        sipInfo: null,
        $app: $('#app'),
        $loginTemplate: $('#template-login'),
        $authFlowTemplate: $('#template-auth-flow'),
        $callTemplate: $('#template-call'),
        $incomingTemplate: $('#template-incoming'),
        $acceptedTemplate: $('#template-accepted'),
    };

    rcObj.modules = {

        cloneTemplate: function($tpl) {
            return $($tpl.html());
        },

        login: function(server, appKey, appSecret, login, ext, password, ll) {
            rcObj.vars.sdk = new RingCentral.SDK({
                appKey: appKey,
                appSecret: appSecret,
                server: server
            });
    
            rcObj.vars.platform = rcObj.vars.sdk.platform();
    
            // TODO: Improve later to support international phone number country codes better
            if (login) {
                login = (login.match(/^[\+1]/)) ? login : '1' + login;
                login = login.replace(/\W/g, '')
            }
    
            rcObj.vars.platform
                .login({
                    username: login,
                    extension: ext || null,
                    password: password
                })
                .then(function () {
                    return rcObj.modules.postLogin(server, appKey, appSecret, login, ext, password, ll);
                }).catch(function (e) {
                console.error(e.stack || e);
            });
        },

        postLogin: function(server, appKey, appSecret, login, ext, password, ll) {
            rcObj.vars.logLevel = ll;
            rcObj.vars.username = login;
    
            localStorage.setItem('webPhoneServer', server || '');
            localStorage.setItem('webPhoneAppKey', appKey || '');
            localStorage.setItem('webPhoneAppSecret', appSecret || '');
            localStorage.setItem('webPhoneLogin', login || '');
            localStorage.setItem('webPhoneExtension', ext || '');
            localStorage.setItem('webPhonePassword', password || '');
            localStorage.setItem('webPhoneLogLevel', rcObj.vars.logLevel || 0);
    
            return rcObj.vars.platform.get('/restapi/v1.0/account/~/extension/~')
                .then(function(res) {
    
                    extension = res.json();
    
                    console.log('Extension info', extension);
    
                    return rcObj.vars.platform.post('/client-info/sip-provision', {
                        sipInfo: [{
                            transport: 'WSS'
                        }]
                    });
    
                })
                .then(function(res) { return res.json(); })
                .then( rcObj.modules.register )
                //.then( rcObj.modules.makeCallForm )
                .then( rcObj.modules.renderDialPad )
                .catch(function(e) {
                    console.error('Error in main promise chain');
                    console.error(e.stack || e);
                });
        },

        register: function(data) {
            rcObj.vars.sipInfo = data.sipInfo[0] || data.sipInfo;
    
            rcObj.vars.webPhone = new RingCentral.WebPhone(data, {
                appKey: localStorage.getItem('webPhoneAppKey'),
                audioHelper: {
                    enabled: true
                },
                logLevel: parseInt( rcObj.vars.logLevel, 10)
            });
    
            rcObj.vars.webPhone.userAgent.audioHelper.loadAudio({
                incoming: '../audio/incoming.ogg',
                outgoing: '../audio/outgoing.ogg'
            })
    
            rcObj.vars.webPhone.userAgent.audioHelper.setVolume(.3);
    
            rcObj.vars.webPhone.userAgent.on('invite', rcObj.modules.onInvite);
            rcObj.vars.webPhone.userAgent.on('connecting', function() { console.log('UA connecting'); });
            rcObj.vars.webPhone.userAgent.on('connected', function() { console.log('UA Connected'); });
            rcObj.vars.webPhone.userAgent.on('disconnected', function() { console.log('UA Disconnected'); });
            rcObj.vars.webPhone.userAgent.on('registered', function() { console.log('UA Registered'); });
            rcObj.vars.webPhone.userAgent.on('unregistered', function() { console.log('UA Unregistered'); });
            rcObj.vars.webPhone.userAgent.on('registrationFailed', function() { console.log('UA RegistrationFailed', arguments); });
            rcObj.vars.webPhone.userAgent.on('message', function() { console.log('UA Message', arguments); });
    
            return rcObj.vars.webPhone;
        },

        onInvite: function(session) {
            console.log('EVENT: Invite', session.request);
            console.log('To', session.request.to.displayName, session.request.to.friendlyName);
            console.log('From', session.request.from.displayName, session.request.from.friendlyName);
    
            var $modal = rcObj.modules.cloneTemplate(rcObj.vars.$incomingTemplate).modal({backdrop: 'static'});
    
            var acceptOptions = {
                media: {
                    render: {
                        remote: document.getElementById('remoteVideo'),
                        local: document.getElementById('localVideo')
                    }
                }
            };
    
            $modal.find('.answer').on('click', function() {
                $modal.find('.before-answer').css('display', 'none');
                $modal.find('.answered').css('display', '');
                session.accept(acceptOptions)
                    .then(function() {
                        $modal.modal('hide');
                        rcObj.modules.onAccepted(session);
                    })
                    .catch(function(e) { console.error('Accept failed', e.stack || e); });
            });
    
            $modal.find('.decline').on('click', function() {
                session.reject();
            });
    
            $modal.find('.toVoicemail').on('click', function() {
                session.toVoicemail();
            });
    
            $modal.find('.forward-form').on('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();
                session.forward($modal.find('input[name=forward]').val().trim(), acceptOptions)
                    .then(function() {
                        console.log('Forwarded');
                        $modal.modal('hide');
                    })
                    .catch(function(e) { console.error('Forward failed', e.stack || e); });
            });
    
            $modal.find('.reply-form').on('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();
                session.replyWithMessage({ replyType: 0, replyText: $modal.find('input[name=reply]').val() })
                    .then(function() {
                        console.log('Replied');
                        $modal.modal('hide');
                    })
                    .catch(function(e) { console.error('Reply failed', e.stack || e); });
            });
    
            session.on('rejected', function() {
                $modal.modal('hide');
            });
        },

        onAccepted: function(session) {
            console.log('EVENT: Accepted', session.request);
            console.log('To', session.request.to.displayName, session.request.to.friendlyName);
            console.log('From', session.request.from.displayName, session.request.from.friendlyName);
    
            var $modal = rcObj.modules.cloneTemplate(rcObj.vars.$acceptedTemplate).modal();
    
            var $info = $modal.find('.info').eq(0);
            var $dtmf = $modal.find('input[name=dtmf]').eq(0);
            var $transfer = $modal.find('input[name=transfer]').eq(0);
            var $flip = $modal.find('input[name=flip]').eq(0);
    
            var interval = setInterval(function() {
    
                var time = session.startTime ? (Math.round((Date.now() - session.startTime) / 1000) + 's') : 'Ringing';
    
                $info.text(
                    'time: ' + time + '\n' +
                    'startTime: ' + JSON.stringify(session.startTime, null, 2) + '\n'
                );
    
            }, 1000);
    
            function close() {
                clearInterval(interval);
                $modal.modal('hide');
            }
    
            $modal.find('.increase-volume').on('click', function() {
                session.ua.audioHelper.setVolume(
                    (session.ua.audioHelper.volume != null ? session.ua.audioHelper.volume : .5) + .1
                );
            });
    
            $modal.find('.decrease-volume').on('click', function() {
                session.ua.audioHelper.setVolume(
                    (session.ua.audioHelper.volume != null ? session.ua.audioHelper.volume : .5) - .1
                );
            });
    
            $modal.find('.mute').on('click', function() {
                session.mute();
            });
    
            $modal.find('.unmute').on('click', function() {
                session.unmute();
            });
    
            $modal.find('.hold').on('click', function() {
                session.hold().then(function() { console.log('Holding'); }).catch(function(e) { console.error('Holding failed', e.stack || e); });
            });
    
            $modal.find('.unhold').on('click', function() {
                session.unhold().then(function() { console.log('UnHolding'); }).catch(function(e) { console.error('UnHolding failed', e.stack || e); });
            });
            $modal.find('.startRecord').on('click', function() {
                session.startRecord().then(function() { console.log('Recording Started'); }).catch(function(e) { console.error('Recording Start failed', e.stack || e); });
            });
    
            $modal.find('.stopRecord').on('click', function() {
                session.stopRecord().then(function() { console.log('Recording Stopped'); }).catch(function(e) { console.error('Recording Stop failed', e.stack || e); });
            });
    
            $modal.find('.park').on('click', function() {
                session.park().then(function() { console.log('Parked'); }).catch(function(e) { console.error('Park failed', e.stack || e); });
            });
    
            $modal.find('.transfer-form').on('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();
                session.transfer($transfer.val().trim()).then(function() { console.log('Transferred'); }).catch(function(e) { console.error('Transfer failed', e.stack || e); });
            });
    
            $modal.find('.transfer-form button.warm').on('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                session.hold().then(function() {
    
                    var newSession = session.ua.invite($transfer.val().trim(), {
                        media: {
                            render: {
                                remote: document.getElementById('remoteVideo'),
                                local: document.getElementById('localVideo')
                            }
                        }
                    });
    
                    newSession.once('accepted', function() {
                        session.warmTransfer(newSession)
                            .then(function() { console.log('Transferred'); })
                            .catch(function(e) { console.error('Transfer failed', e.stack || e); });
                    });
    
                });
    
            });
    
            $modal.find('.flip-form').on('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();
                session.flip($flip.val().trim()).then(function() { console.log('Flipped'); }).catch(function(e) { console.error('Flip failed', e.stack || e); });
                $flip.val('');
            });
    
            $modal.find('.dtmf-form').on('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();
                session.dtmf($dtmf.val().trim());
                $dtmf.val('');
            });
    
            $modal.find('.hangup').on('click', function() {
                session.terminate();
            });
    
            session.on('accepted', function() { console.log('Event: Accepted'); });
            session.on('progress', function() { console.log('Event: Progress'); });
            session.on('rejected', function() {
                console.log('Event: Rejected');
                close();
            });
            session.on('failed', function() {
                console.log('Event: Failed');
                close();
            });
            session.on('terminated', function() {
                console.log('Event: Terminated');
                close();
            });
            session.on('cancel', function() {
                console.log('Event: Cancel');
                close();
            });
            session.on('refer', function() {
                console.log('Event: Refer');
                close();
            });
            session.on('replaced', function(newSession) {
                console.log('Event: Replaced: old session', session, 'has been replaced with', newSession);
                close();
                onAccepted(newSession);
            });
            session.on('dtmf', function() { console.log('Event: DTMF'); });
            session.on('muted', function() { console.log('Event: Muted'); });
            session.on('unmuted', function() { console.log('Event: Unmuted'); });
            session.on('connecting', function() { console.log('Event: Connecting'); });
            session.on('bye', function() {
                console.log('Event: Bye');
                close();
            });
    
            session.mediaHandler.on('iceConnection', function() { console.log('Event: ICE: iceConnection'); });
            session.mediaHandler.on('iceConnectionChecking', function() { console.log('Event: ICE: iceConnectionChecking'); });
            session.mediaHandler.on('iceConnectionConnected', function() { console.log('Event: ICE: iceConnectionConnected'); });
            session.mediaHandler.on('iceConnectionCompleted', function() { console.log('Event: ICE: iceConnectionCompleted'); });
            session.mediaHandler.on('iceConnectionFailed', function() { console.log('Event: ICE: iceConnectionFailed'); });
            session.mediaHandler.on('iceConnectionDisconnected', function() { console.log('Event: ICE: iceConnectionDisconnected'); });
            session.mediaHandler.on('iceConnectionClosed', function() { console.log('Event: ICE: iceConnectionClosed'); });
            session.mediaHandler.on('iceGatheringComplete', function() { console.log('Event: ICE: iceGatheringComplete'); });
            session.mediaHandler.on('iceGathering', function() { console.log('Event: ICE: iceGathering'); });
            session.mediaHandler.on('iceCandidate', function() { console.log('Event: ICE: iceCandidate'); });
            session.mediaHandler.on('userMedia', function() { console.log('Event: ICE: userMedia'); });
            session.mediaHandler.on('userMediaRequest', function() { console.log('Event: ICE: userMediaRequest'); });
            session.mediaHandler.on('userMediaFailed', function() { console.log('Event: ICE: userMediaFailed'); });
        },

        renderDialPad: function() {
            var dialPad = new DialPad({
                target: '#dial-pad',
                sdk: rcObj.vars.sdk,
                webPhone: rcObj.vars.webPhone,
                afterCallout: function() { }
            });

            var callLog = new CallLog({
                target: '#call-log',
                sdk: rcObj.vars.sdk,
                webPhone: rcObj.vars.webPhone
            });      
        },        

        makeCall: function(number, homeCountryId) {
            homeCountryId = homeCountryId
            || (rcObj.vars.extension && rcObj.vars.extension.regionalSettings && rcObj.vars.extension.regionalSettings.homeCountry && rcObj.vars.extension.regionalSettings.homeCountry.id)
            || null;

            var session = rcObj.vars.webPhone.userAgent.invite(number, {
                media: {
                    render: {
                        remote: document.getElementById('remoteVideo'),
                        local: document.getElementById('localVideo')
                    }
                },
                fromNumber: rcObj.vars.username,
                homeCountryId: homeCountryId
            });

            rcObj.modules.onAccepted(session);
        },

        makeCallForm: function() {
            var $form = rcObj.modules.cloneTemplate( rcObj.vars.$callTemplate );

            var $number = $form.find('input[name=number]').eq(0);
            var $homeCountry = $form.find('input[name=homeCountry]').eq(0);
    
            $number.val(localStorage.getItem('webPhoneLastNumber') || '');
    
            $form.on('submit', function(e) {
    
                e.preventDefault();
                e.stopPropagation();
    
                localStorage.setItem('webPhoneLastNumber', $number.val() || '');
    
                rcObj.modules.makeCall($number.val(), $homeCountry.val());
    
            });
    
            rcObj.vars.$app.empty().append($form);
        },
    };

})(jQuery, window);

jQuery(document).ready(function() {
    rcObj.modules.login(
        rcObj.credentials['server'], 
        rcObj.credentials['appKey'], 
        rcObj.credentials['appSecret'],
        rcObj.credentials['login'], 
        rcObj.credentials['ext'], 
        rcObj.credentials['password'], 
        rcObj.credentials['logLevel']
    );
});



/* TABS - Start */
$('ul.rcTabs').each(function() {
    var $active, $content, $tabs = $(this).find('span');
  
    $active = $( $tabs[0] );
    $active.addClass('active');
  
    $content = $( $active[0].getAttribute('data-content') );
  
    $tabs.not($active).each(function () {
        $( this.getAttribute('data-content') ).hide();
    });
  
    $(this).on('click', 'span', function(e){
        $active.removeClass('active');
        $content.hide();
    
        $active = $(this);
        $content = $( this.getAttribute('data-content') );
    
        $active.addClass('active');
        $content.show();
    
        e.preventDefault();
    });
  });
/* TABS - End */