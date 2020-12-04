window.jentis = window.jentis || {};
window.jentis.config = window.jentis.config || {};
window.jentis.config.account = "greenpeace.live";
window.jentis.config.trackdomain = "//jtsp.greenpeace.at";
window.jentis.config.loadcss = false;

window.jentis = window.jentis || {};

window.jentis.tracker = new function () {
	
	
	this.aGateConfigs = {};
	this.aGateLibs = {};
	this.aGateObjects = {};
	this.aGateFunctions = {};	
	this.fDataProcessor = false;	
	this.oGateObjectsByTrackerId = {};
	this.aConsent = {};
	
	this.tracks = [];

	// Feature detect + local reference
	this.storage = false;
	var fail = false;
	var uid = false;
	try {
		uid = new Date;
		(this.storage = window.localStorage).setItem(uid, uid);
		fail = this.storage.getItem(uid) != uid;
		this.storage.removeItem(uid);
		fail && (this.storage = false);
	} catch (exception) {}

	this.sessionstorage = false;

	if(this.storage)
	{
		this.sessionstorage = window.sessionStorage;
	}
	
	this.init = function(){
		
		//Maybe the _jts tracker not defined yet.
		window._jts = window._jts || [];			
		
		//Store the original push command, so we can use it inside the new push command.
		window._jts.opush = window._jts.push;

		//Check if Log-Mode is enabled
		this.checkLogMode();

		// Check if Preview is enabled
		this.checkPreview();

		//If somebody pushes to the the tracker object, we will listen.
		window._jts.push = function (oTrackData) {

			window.jentis.tracker.log("Called JTS-Command: " + oTrackData.track, oTrackData);

			//Send the data to the jentis object.
			window.jentis.tracker.track(oTrackData);
			
			//Call the original push function
			window._jts.opush(oTrackData);
		};
		
		//Pass all the allready made pushes to the jentis object.
		for(var i=0; i< window._jts.length; i++)
		{
			this.track(window._jts[i]);
		}
		
		//Check if we must load a css file
		//cdnhost is defined by the JS JENTIS Base Code 
		if(
			typeof window.jentis.config !== "undefined" &&
			typeof window.jentis.config.loadcss !== "undefined" &&
			typeof window.jentis.config.cdnhost !== "undefined" &&
			window.jentis.config.loadcss.loadcss === true
		)
		{			
			var oCss = document.createElement("link");
			oCss.rel="stylesheet";
			oCss.id = "jentis-styles";
			oCss.href = window.jentis.config.cdnhost+"jts.css";
			oCss.type = "text/css";
			oCss.media = "all";
			document.getElementsByTagName("head").append(oCss);
		}
		
		//Now communicat with the consent bar.
		this.initCommunicationWithConsentBar();

	}

	/**
	 * Function for deleting all known push-commands for One-Page-Applications
	 */
	this.resetPushData = function() {
		this.tracks = [];
	}
	
    /**
     * Start Listen to Consentbar Events Init and add.
     */		
	this.initCommunicationWithConsentBar = function()
	{
		(function(oMe) {
		
			//if we get a consentbar init we have to init our gates.
			var oCbSetConsent = function (e) {
				
				for(var sToolId in e.detail.tools)
				{
					var bConsent = e.detail.tools[sToolId];
					oMe.aConsent[sToolId] = bConsent;
					
					oMe.initGate(sToolId)
				}
			};
			
			if(
				typeof window.jentis.consentbar !== "undefined" &&
				typeof window.jentis.consentbar.registerEvent === "function"
			)
			{
				//The jentis consent bar allready exists, so we are using their event register function to be sure not to miss any event.
				window.jentis.consentbar.registerEvent("jentis-consent-init",oCbSetConsent)
				window.jentis.consentbar.registerEvent("jentis-pixel-add",oCbSetConsent)
				
			}
			else
			{
				//Beacaus the JENTIS Tracker is earlier executed then the consentbar, we must register our cb to windowEventListener instear of 
				//calling registerEvent function from the Consentbar.
				document.addEventListener('jentis-consent-init', oCbSetConsent);
				document.addEventListener('jentis-pixel-add', oCbSetConsent);
			}
			
			
		})(this);	
		
	}
	
    /**
     * Waiting for commands which should be executed directly to an object via trackingId
     * @param {string} sTrackerId - The backend TrackerId which object should be used.
     * @param {string} sCmd - The command (=function name) which should be excetuded.	 
     * @param {object} oArg - A key value pair object which will be passed to the function.
     * @return {bool} false if there was an error like something didn't exist or true if the function was called.	 
     */	
	this.callCommandByTrackerId = function(sTrackerId, sCmd, oArg)
	{
		//Of the object with this trackerId not exists, return error.
		if(typeof this.oGateObjectsByTrackerId[sTrackerId] === "undefined")
		{
			return false;
		}
		
		//If the function not exists, return error.
		if(typeof this.oGateObjectsByTrackerId[sTrackerId][sCmd] !== "function")
		{
			return false;
		}
		
		//Now call the function and pass the object as this and the argument object
		this.oGateObjectsByTrackerId[sTrackerId][sCmd].call(this.oGateObjectsByTrackerId[sTrackerId],oArg);
		
		return true;
		
	}
	
    /**
     * Take the tracking data to share it with all registerd gates and gates which will register later.
     * @param {string} oTrackDate - The tracking data.
     */	
	this.track = function (oTrackData)
	{
		try {
			//If a DataProcessor ist registered, pass the Tracking Data trough that function.
			if (this.fDataProcessor !== false) {
				oTrackData = this.fDataProcessor[0].call(this.fDataProcessor[1], oTrackData);
			}

			var sTrack = oTrackData.track;
			delete oTrackData.track;

			//Stores the tracking data to the internal storage
			this.tracks[sTrack] = this.tracks[sTrack] || [];
			this.tracks[sTrack].push(oTrackData);

			//Exe all functions of gates, which allready are registerd to that tracking command.
			if (typeof this.aGateFunctions[sTrack] !== "undefined") {
				for (var i = 0; i < this.aGateFunctions[sTrack].length; i++) {
					var fFunc = this.aGateFunctions[sTrack][i][0];
					var oThisObj = this.aGateFunctions[sTrack][i][1];

					try {
						this.exeGateFunc(fFunc, oThisObj, oTrackData);
					} catch(e) {
						if(typeof oThisObj.sPluginID !== "undefined") {
							this.logError("["+oThisObj.sPluginID+"]["+sTrack+"] Function Error",e);
						} else {
							this.logError("[Plugin-ID UNKOWN]["+sTrack+"] Function Error",e);
						}
					}
				}
			}
		}
		catch(e) {
			this.logError("[track] Function Error",e);
		}

	}
	
    /**
     * Take gate information and the tracking data and execute the gate function.
     * @param {function} fFunc - The Function which should be called.
     * @param {object} oThisObj - The Object which should be used as `this` for the function.
     * @param {object} oTrackData - The Tracking Data which should be passed.	 
     */		
	this.exeGateFunc = function(fFunc,oThisObj,oTrackData)
	{
		fFunc.call(oThisObj,oTrackData);										
	}

    /**
     * Register a Data processor function and set it to the internal storage.
     * @param {function} fFunc - The function which should be registered.
     * @param {object} oThisObj - The object which should be passed as this value if the function is called.
     */	
	this.registerDataProcessor = function(fFunc,oThisObj)
	{
		this.fDataProcessor = [fFunc,oThisObj];
	}

    /**
     * Register the Library from a Gate and set it to the internal storage.
     * @param {string} sGateId - The Gate Identifier.
     * @param {function} fLib - A Function which should be used as Tracker Lib function.
     */			
	this.registerGateLib = function(sGateId,fLib){

		this.log("["+sGateId+"] - Gate-Lib registered");
		this.aGateLibs[sGateId] = fLib;
		this.initGate(sGateId);
	}
	
    /**
     * Register the Config from a Gate and set it to the internal storage.
     * @param {string} sGateId - The Gate Identifier.
     * @param {function} fLib - A JSON Object which should be used as Tracker Configuration.
     */			
	this.registerGateConf = function(sGateId,sTrackerId,oConf){

		this.log("["+sGateId+"] - Gate-Conf registered");
		this.aGateConfigs[sGateId] = this.aGateConfigs[sGateId] || [];
		
		this.aGateConfigs[sGateId].push({"conf":oConf,"trackerId":sTrackerId});
		this.initGate(sGateId);
	}

    /**
     * Check if there are some configs and a least one lib to get the Gate start working.
     * @param {string} sGateId - The Gate Identifier.
     */				
	this.initGate = function(sGateId){
		if(
			typeof this.aGateLibs[sGateId] === "function" &&
			typeof this.aGateConfigs[sGateId] === "object" &&
			this.aGateConfigs[sGateId].length > 0
		)
		{
			//Check all Configs and initiate a new object from the lib with each config.
			for(var i=0; i < this.aGateConfigs[sGateId].length; i++)
			{
				this.log("["+sGateId+"] - Gate-Init Done");

				var oConf = this.aGateConfigs[sGateId][i].conf;
				var sTrackerId = this.aGateConfigs[sGateId][i].trackerId
				var oGateObject = new this.aGateLibs[sGateId](this,oConf);
				
				this.aGateObjects[sGateId] = this.aGateObjects[sGateId] || [];
				
				this.aGateObjects[sGateId].push(oGateObject);
				this.oGateObjectsByTrackerId[sTrackerId] = oGateObject;
			}
			
			//Clear config storage for that gate.
			this.aGateConfigs[sGateId] = [];
		}
	}

    /**
     * Register a Gate Function to a tracking command to be called whenever this tacking command was tracked.
     * @param {string} sTrack - The Trackingcommand.
     * @param {function} fFunc - The function which should be registered.
     * @param {object} oThisObj - The initialized Gate itself to be used as this value whenever the function is called.
     */					
	this.registerGateFunc = function(sTrack,fFunc,oThisObj)
	{
		//Store the function to the internal storage
		this.aGateFunctions[sTrack] = this.aGateFunctions[sTrack] || [];
		this.aGateFunctions[sTrack].push([fFunc,oThisObj]);
		
		//Check if there was this tracking command allready tracked.
		if(typeof this.tracks[sTrack] !== "undefined")
		{
			for(var i=0; i< this.tracks[sTrack].length; i++)
			{
				var oTrackData = this.tracks[sTrack][i];				
				this.exeGateFunc(fFunc,oThisObj,oTrackData);							
			}			
		}
	}

	/*
		######## HELPER ########
	 */

	this.readCookie = function(sName) {
		var sNameEQ = sName + "=";
		var aCookies = document.cookie.split(';');

		for(var i = 0; i < aCookies.length; i++)
		{
			var sCookie = aCookies[i];

			//left trim
			while (sCookie.charAt(0) == ' ') sCookie = sCookie.substring(1, sCookie.length);

			if (sCookie.indexOf(sNameEQ) == 0) return unescape(sCookie.substring(sNameEQ.length, sCookie.length));
		}

		return null;
	}

	this.setCookie = function(oArgs) {
		var exdate=new Date();

		if(oArgs.exdays !== null && typeof oArgs.exdays === "object")
		{
			exdate.setTime(
				exdate.getTime() +
				(
					((typeof oArgs.exdays.h !== "undefined" ? oArgs.exdays.h : 0) * 60 * 60) +
					((typeof oArgs.exdays.m !== "undefined" ? oArgs.exdays.m : 0) * 60) +
					(typeof oArgs.exdays.s !== "undefined" ? oArgs.exdays.s : 0)
				)*1000
			);
		}
		else
		{
			exdate.setDate(exdate.getDate() + oArgs.exdays);
		}

		var sDomain = window.location.host;
		var aDomainParts = sDomain.split('.');
		aDomainParts.reverse();
		sDomain = "."+aDomainParts[1]+"."+aDomainParts[0];


		var c_value=escape(oArgs.value) + "; path=/; domain="+sDomain+""+((oArgs.exdays==null) ? "" : "; expires="+exdate.toUTCString())+((typeof oArgs.sameSite !== "undefined") ? "; SameSite="+oArgs.sameSite : "")+((typeof oArgs.bSecure !== "undefined" && oArgs.bSecure === true) ? "; Secure="+oArgs.bSecure : "");
		document.cookie=oArgs.name + "=" + c_value;
	}

	this.checkLogMode = function()
	{
		var sTestCookie = this.readCookie("jts_log");
		if(sTestCookie != null)
		{
			this.bLogMode = true;
		}
		else
		{
			var regexSearchPar = new RegExp("jts_log=([^&#]*)");

			if(regexSearchPar.test(document.location.search))
			{
				this.setCookie({
					name    :   "jts_log",
					value   :   "1",
					exdays  :   365,
					sameSite : "Strict"
				});

				this.bLogMode = true;
			}
		}
	}

	this.checkPreview = function()
	{
		var oParams = this.fGetUrlParams();

		if(typeof oParams["jts_preview"] !== "undefined")
		{
			var sStorageKey = "jts_preview_version";
			var sStorageValue = oParams["jts_preview"];

			if(this.storage) {
				if(typeof oParams["jts_storage"] !== "undefined") {
					// Difference between local- / sessionStorage
					if(oParams["jts_storage"] === "s") {
						this.sessionstorage.setItem(sStorageKey, sStorageValue);
					} else {
						this.storage.setItem(sStorageKey, sStorageValue);
					}
				} else {
					// Fallback: SessionStorage
					this.sessionstorage.setItem(sStorageKey, sStorageValue);
				}
			} else {
				// Fallback: Cookie (Lifetime: Session)
				this.setCookie({
					name    :   sStorageKey,
					value   :   sStorageValue,
					exdays  :   null,
					sameSite : "Strict"
				});
			}

			var sParams = "";
			for (var key in oParams) {
				if(key === "jts_preview" || key === "jts_storage") {
					continue;
				}
				if (sParams != "") {
					sParams += "&";
				}
				sParams += key + "=" + encodeURIComponent(oParams[key]);
			}

			window.location.href = window.location.protocol + "//" + window.location.host + window.location.pathname + "?" + sParams;
		}

	}

	this.log = function (sKey, sMessage)
	{
		if(this.bLogMode === true) {
			if (typeof sMessage === "undefined")
			{
				if (typeof sKey === "object")
				{
					console.log("[JTS]: %o", sKey);
				}
				else
				{
					console.log("[JTS]: " + sKey);
				}
			}
			else
			{
				if (typeof sMessage === "object")
				{
					console.log("[JTS]: " + sKey + " : %o", sMessage);
				}
				else
				{
					console.log("[JTS]: " + sKey + " : " + sMessage);
				}
			}
		}
	}

	this.fGetUrlParams = function()
	{
		var urlParams = "";
		(window.onpopstate = function ()
		{
			var match,
				pl = /\+/g,  // Regex for replacing addition symbol with a space
				search = /([^&=]+)=?([^&]*)/g,
				decode = function (s)
				{
					return window.decodeURIComponent(s.replace(pl, " "));
				},
				query = window.location.search.substring(1);

			urlParams = {};
			while (match = search.exec(query))
			{
				urlParams[decode(match[1])] = decode(match[2]);
			}
		})();
		return urlParams;
	}

	this.cloneObject = function(oObject)
	{
		if (Object.prototype.toString.call(oObject) === '[object Array]')
		{
			let clone = [];
			for (let i=0; i<oObject.length; i++)
				clone[i] = this.cloneObject(oObject[i]);

			return clone;
		}
		else if (typeof(oObject)=="object")
		{
			let clone = {};
			for (let prop in oObject)
				if (oObject.hasOwnProperty(prop))
					clone[prop] = this.cloneObject(oObject[prop]);

			return clone;
		}
		else
			return oObject;
	}

	this.logError = function(sMessage,oError)
	{
		console.group("JENTIS-Tracker - Error Report");
		console.log(sMessage);
		console.error(oError);
	}

	this.init();
	
};

(function () {

    if(typeof window.jentis.tracker.registerDataProcessor === "function"){

        var oDataProcessor = new function () {
            this.oProductCache = {};
            this.oVarCache = {};

            /**
             * This function is called whenever a Tracking Command is pushed for data manipulation before the manipulated data are shared with the other gates.
             * @param {object} oTrackData - The Tracking Data which should been modified.
             * @return {object} The modified Tracking Data.
             */
            this.processData = function(oTrackData){

                if(typeof oTrackData.track !== "undefined") {
                    if(oTrackData.track === "product" && oTrackData["type"]) {
                        if(typeof this.oProductCache[oTrackData["type"]] === "undefined") {
                            this.oProductCache[oTrackData["type"]] = [];
                        }
                        this.oProductCache[oTrackData["type"]].push(oTrackData);
                    } else if(oTrackData.track === "var" && typeof oTrackData.type !== "undefined") {
                        if(typeof this.oVarCache[oTrackData.type] === "undefined") {
                            this.oVarCache[oTrackData.type] = [];
                        }
                        this.oVarCache[oTrackData.type].push(oTrackData);
                    }
                    if(typeof this.oProductCache[oTrackData.track] !== "undefined") {
                        oTrackData["products"] = this.oProductCache[oTrackData.track];
                        delete this.oProductCache[oTrackData.track];
                    } else if(typeof this.oVarCache[oTrackData.track] !== "undefined") {
                        oTrackData["vars"] = this.oVarCache[oTrackData.track];
                        delete this.oVarCache[oTrackData.track];
                    }
                }
                return oTrackData;
            }

        };

        window.jentis.tracker.registerDataProcessor(oDataProcessor.processData,oDataProcessor);

    }

})();

window.jentis.tracker.registerGateLib("jentis.core.tracker.rawdata-controller", function (jtsTracker, oGateConfig) {
    this.jtsTracker = jtsTracker;
    this.oGateConfig = oGateConfig;

    // ########## GATE-VARS ##########
    this.sPluginID = "jentis.core.tracker.rawdata-controller"; // Defines the unique plugin JENTIS-ID

    this.oDocParentCoordinator = {};
    this.oDocCache = {};
    this.bFinal = false;

    this.oMultipleCache = {};

    this.oCache = {};
    this.sParentCacheName = (typeof this.oGateConfig.cookieParents !== "undefined" ? this.oGateConfig.cookieParents : "jentis_raw_controller_parents");
    this.sDocumentIDs = (typeof this.oGateConfig.cookieDocumentIds !== "undefined" ? this.oGateConfig.cookieDocumentIds : "jentis_raw_controller_documentids");
    this.sDomainSettings = (typeof this.oGateConfig.cookieDomain !== "undefined" ? this.oGateConfig.lsDomain : "jentis_raw_controller_domains");

    // ########## GATE-FUNCS ##########

    this._construct = function () {

        this.init();

        // ########## REGISTER-GATE-FUNCS ##########

        this.jtsTracker.registerGateFunc("trackdoc", this.trackDoc, this);
        this.jtsTracker.registerGateFunc("readdoc", this.readDoc, this);
        this.jtsTracker.registerGateFunc("senddoc", this.sendDoc, this);
    };

    this.init = function () {

        // Check if Cookie is available
        if (typeof this.oCache[this.sDocumentIDs] === "undefined") {
            var sCookieName = (typeof this.oGateConfig.cookieName !== "undefined" ? this.oGateConfig.cookieName : "jts-rw");
            var oValue = JSON.parse(this.jtsTracker.readCookie(sCookieName));
            if (oValue === null) {
                // Fallback: All old cookies should be migrated

                // Document-IDs 1:1 übernehmen
                var oDocumentIDs = JSON.parse(this.jtsTracker.readCookie(this.sDocumentIDs));

                if (oDocumentIDs !== null) {
                    this.oCache[this.sDocumentIDs] = oDocumentIDs;
                } else {
                    this.oCache[this.sDocumentIDs] = {};
                }

                // Parents migrieren in Document-IDs
                var oParents = JSON.parse(this.jtsTracker.readCookie(this.sParentCacheName));

                if (oParents !== null) {
                    try {
                        for (var source in oParents) {
                            for (var sDocID in oParents[source]) {
                                for (var docType in oDocumentIDs[source]) {
                                    if (oDocumentIDs[source][docType] === sDocID) {
                                        oDocumentIDs[source][docType] = {
                                            "_id": oDocumentIDs[source][docType],
                                            "parent": oParents[source][sDocID].parent,
                                            "parentid": oParents[source][sDocID].parentid
                                        };
                                        break;
                                    }
                                }
                            }
                        }

                        if (typeof oDocumentIDs[source]["user"] !== "undefined") {
                            oDocumentIDs[source]["user"] = {
                                "_id": oDocumentIDs[source]["user"]
                            };
                        }
                    } catch (ex) {
                        console.log("["+this.sPluginID+"] - ERROR AT MERGING!");
                        this.oCache[this.sDocumentIDs] = {};
                    }
                }

                // Domain-Settings migrieren
                var oDomainSettings = JSON.parse(this.jtsTracker.readCookie(this.sDomainSettings));

                if (oDomainSettings === null) {
                    this.oCache[this.sDomainSettings] = {};

                    var iServer = Math.floor(Math.random() * this.oGateConfig.aTrackDomainsListing.length);
                    this.oCache[this.sDomainSettings].serverid = this.oGateConfig.aTrackDomainsListing[iServer];
                } else {
                    this.oCache[this.sDomainSettings] = {};
                    this.oCache[this.sDomainSettings].serverid = oDomainSettings.serverid;
                }

                // Delete OLD Cookies
                this.jtsTracker.setCookie({
                    name: this.sParentCacheName,
                    value: "",
                    exdays: -1,
                });

                this.jtsTracker.setCookie({
                    name: this.sDocumentIDs,
                    value: "",
                    exdays: -1,
                });

                this.jtsTracker.setCookie({
                    name: this.sDomainSettings,
                    value: "",
                    exdays: -1,
                });
            } else {
                // Von Cookie 1:1 übernehmen
                this.oCache = oValue;
            }
        }
    }

    /**
     * Function for tracking a document
     *
     * @param {Object} oArgs - informationobject about the document
     * @param {string} oArgs.doc - name of the document
     * @param {string} oArgs.parent - name of the document, which is the hierarchically parent
     * @param {object} oArgs.prop - Key-Value with properties for extending the information of the document
     * @param {function} oArgs.cb - Callback-Function - Param: ID of the document
     */
    this.trackDoc = function (oArgs) {


        if (typeof oArgs.doc !== "undefined") {
            if (typeof oArgs.act !== "undefined") {
                var oLSData = this.getLSData(oArgs);

                var oDoc = {
                    _id: oLSData._id,
                    action: oArgs.act,
                    account: (window.jentis.config.frontend.project+"."+window.jentis.config.frontend.env),
                    documentType: oArgs.doc,
                    server: this.oCache[this.sDomainSettings].serverid,
                    property: (oArgs.prop || {}),
                    aggr: (oArgs.aggr || {}),
                    source: oArgs.source,
                    bNoParentStorage: (typeof oArgs.bNoParentStorage !== "undefined" ? oArgs.bNoParentStorage : false)
                };

                if (typeof oArgs.parent !== "undefined") {
                    oDoc.parent = oArgs.parent;
                }

                if (typeof this.oDocCache[oDoc.source] === "undefined") {
                    this.oDocCache[oDoc.source] = {};
                }

                if (
                    typeof this.oDocCache[oDoc.source][oDoc._id] !== "undefined" && oDoc.action === "upd"
                ) {
                    for (var prop in oDoc.property) {
                        this.oDocCache[oDoc.source][oDoc._id].property[prop] = oDoc.property[prop];
                    }
                } else {
                    this.oDocCache[oDoc.source][oDoc._id] = oDoc;
                }

                var self = this;

                // Callback-Function from the Child-Inner-Gate
                if (typeof oArgs.cb === "function") {
                    oArgs.cb(oLSData, function (oData) {
                        if (typeof oData !== "undefined" && typeof oData.properties !== "undefined") {
                            for (var i = 0; i < oData.properties.length; i++) {
                                self.oDocCache[oDoc.source][oDoc._id].property[oData.properties[i].key] = oData.properties[i].value;
                            }
                        }
                    });
                }
            } else {
                this.jtsTracker.trackError("error", "[TG4-RAW-CONTROLLER] Missing \"act\" - attribute on TG4-trackdoc");
            }
        } else {
            this.jtsTracker.trackError("error", "[TG4-RAW-CONTROLLER] Missing \"doc\" - attribute on TG4-trackdoc");
        }
    }

    this.readDoc = function (oArgs) {


        oArgs.act = "read"; // To get data from Local Storage
        oArgs.cb(this.getLSData(oArgs));
    }

    this.sendDoc = function (oArgs) {


        var sSource = oArgs.source;

        if (typeof this.oDocCache[sSource] !== "undefined") {
            var aKeys = Object.keys(this.oDocCache[sSource]);
            for (var i = 0; i < aKeys.length; i++) {
                // Normal Cache
                if (
                    typeof this.oCache[this.sDocumentIDs] !== "undefined" &&
                    typeof this.oCache[this.sDocumentIDs][sSource] !== "undefined" &&
                    typeof this.oCache[this.sDocumentIDs][sSource][this.oDocCache[sSource][aKeys[i]].documentType] !== "undefined" &&
                    typeof this.oCache[this.sDocumentIDs][sSource][this.oDocCache[sSource][aKeys[i]].documentType].parent !== "undefined" &&
                    typeof this.oCache[this.sDocumentIDs][sSource][this.oCache[this.sDocumentIDs][sSource][this.oDocCache[sSource][aKeys[i]].documentType].parent] !== "undefined"
                ) {
                    this.oCache[this.sDocumentIDs][sSource][this.oDocCache[sSource][aKeys[i]].documentType].parentid = this.oCache[this.sDocumentIDs][sSource][this.oCache[this.sDocumentIDs][sSource][this.oDocCache[sSource][aKeys[i]].documentType].parent]["_id"];
                }

                // Multiple Cache
                if (
                    typeof this.oMultipleCache[sSource] !== "undefined" &&
                    typeof this.oMultipleCache[sSource][this.oDocCache[sSource][aKeys[i]]["_id"]] !== "undefined" &&
                    typeof this.oMultipleCache[sSource][this.oDocCache[sSource][aKeys[i]]["_id"]].parent !== "undefined" &&
                    typeof this.oDocCache[sSource][aKeys[i]].parent !== "undefined" &&
                    typeof this.oCache[this.sDocumentIDs][sSource][this.oDocCache[sSource][aKeys[i]].parent]["_id"] !== "undefined"
                ) {
                    this.oMultipleCache[sSource][this.oDocCache[sSource][aKeys[i]]["_id"]].parentid = this.oCache[this.sDocumentIDs][sSource][this.oDocCache[sSource][aKeys[i]].parent]["_id"];
                }
            }

            this.sendBeacon(this.oDocCache[sSource], sSource);

            this.jtsTracker.log("["+this.sPluginID+"] - SEND - SOURCE: \"" + sSource + "\"");
        } else {
            this.jtsTracker.log("["+this.sPluginID+"] - SOURCE: \"" + sSource + "\" nicht in Cache gefunden");
        }
    }

    //##################
    // Hilfsfunktionen #
    //##################
    this.sendBeacon = function (oJsonArray, sSource, sMethod) {


        if (typeof sMethod === "undefined") {
            var method = "POST";
        }

        var aResult = [];
        var aKeys = Object.keys(oJsonArray);

        for (var i = 0; i < aKeys.length; i++) {
            // Spezialfall Multiple
            if (typeof oJsonArray[aKeys[i]].bNoParentStorage !== "undefined" && oJsonArray[aKeys[i]].bNoParentStorage === true) {
                // Vor den Parent-Generierungen muss im Documents-Cache die ID aktualisiert werden
                if (
                    typeof this.oCache[this.sDocumentIDs][sSource][oJsonArray[aKeys[i]].documentType] !== "undefined" &&
                    typeof this.oCache[this.sDocumentIDs][sSource][oJsonArray[aKeys[i]].documentType].parent !== "undefined" &&
                    typeof this.oCache[this.sDocumentIDs][sSource][oJsonArray[aKeys[i]].documentType].parentid !== "undefined" &&
                    typeof this.oMultipleCache[sSource][oJsonArray[aKeys[i]]["_id"]] !== "undefined" &&
                    typeof this.oMultipleCache[sSource][oJsonArray[aKeys[i]]["_id"]].parent !== "undefined" &&
                    typeof this.oMultipleCache[sSource][oJsonArray[aKeys[i]]["_id"]].parentid !== "undefined"
                ) {
                    this.oCache[this.sDocumentIDs][sSource][oJsonArray[aKeys[i]].documentType].parent = this.oMultipleCache[sSource][oJsonArray[aKeys[i]]["_id"]].parent;
                    this.oCache[this.sDocumentIDs][sSource][oJsonArray[aKeys[i]].documentType].parentid = this.oMultipleCache[sSource][oJsonArray[aKeys[i]]["_id"]].parentid;
                }
            }

            var oParents = this.getParents(oJsonArray[aKeys[i]].documentType, sSource);
            if (oParents !== null) {
                oJsonArray[aKeys[i]].parent = oParents;
            }

            aResult.push(oJsonArray[aKeys[i]]);

            delete this.oDocCache[sSource][aKeys[i]];
        }

        if (method === "POST") {
            this.sendBeaconPOST(aResult, this.responseCallbackFromDatareceiver);
        } else if (method === "GET") {
            this.sendBeaconGET(aResult, this.responseCallbackFromDatareceiver);
        } else {
            this.jtsTracker.log("["+this.sPluginID+"] - No sending method found instead of POST or GET!");
        }

        this.oMultipleCache[sSource] = {};
    }

    this.sendBeaconPOST = function (aJsonArray, fCallback) {


        if (aJsonArray.length > 0) {
            this.jtsTracker.log("["+this.sPluginID+"] - [POST] | SEND-DATA", aJsonArray);

            var http = new XMLHttpRequest();
            var url = this.oGateConfig.oTrackDomains[this.oCache[this.sDomainSettings].serverid];
            var params = "json=" + btoa(encodeURIComponent(JSON.stringify(this.getDataToSend(aJsonArray))));
            http.open('POST', url, true);
            http.withCredentials = true;

            //Send the proper header information along with the request
            http.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

            var self = this;
            http.onreadystatechange = function () {//Call a function when the state changes.
                if (http.readyState == 4 && http.status == 200) {
                    if (typeof fCallback === "function") {
                        fCallback.apply(self, [http]);
                    }
                }
            }
            http.send(params);
        }

    }
    this.sendBeaconGET = function (aJsonArray, fCallback) {


        if (aJsonArray.length > 0) {
            var sSrc = this.oGateConfig.oTrackDomains[this.oCache[this.sDomainSettings].serverid] + "?" + "data=" + btoa(encodeURIComponent(JSON.stringify(this.getDataToSend(aJsonArray))));

            var self = this;
            var http = new XMLHttpRequest();
            http.onreadystatechange = function () {
                if (http.readyState == 4 && http.status == 200) {
                    if (typeof fCallback === "function") {
                        fCallback.apply(self, [http]);
                    }
                }
            };
            http.open("GET", sSrc, true);
            //http.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
            http.send();
        }

    }

    this.responseCallbackFromDatareceiver = function(response) {

        if(typeof response.response === "string") {
            var oData = JSON.parse(response.response);
            if(typeof oData["commands"] !== "undefined") {
                for(var iCommandIterator = 0; iCommandIterator < oData["commands"].length; iCommandIterator++) {
                    var oCommand = oData["commands"][iCommandIterator];
                    if(typeof oCommand.command !== "undefined") {
                        window.jentis.tracker.log("["+this.sPluginID+"] - [JTSP-CALLBACK] Command: " + oCommand.command + " received");
                        if(oCommand.command === "sendStream") {
                            if(typeof oCommand["trackerId"] !== "undefined" && typeof oCommand["arguments"] !== "undefined") {
                                window.jentis.tracker.log("["+this.sPluginID+"] - [JTSP-CALLBACK] Command: " + oCommand.command + " executed for Tracker-ID: " + oCommand["trackerId"] + " with args: ", oCommand["arguments"]);
                                window.jentis.tracker.callCommandByTrackerId(oCommand["trackerId"], oCommand.command, oCommand["arguments"]);
                            }
                        }
                    }
                }
            }
        }
    }

    this.getDataToSend = function (aJsonArray) {


        // Cookie - Kommando abschicken
        var oStream = {};
        oStream.cmd = {
            "key": "setcookie",
            "data": [{
                "name": (typeof this.oGateConfig.cookieName !== "undefined" ? this.oGateConfig.cookieName : "jts-rw"),
                "value": JSON.stringify(this.oCache),
                "exdays": (typeof this.oGateConfig.cookieNameDuration !== "undefined" ? this.oGateConfig.cookieNameDuration : 63072000)
            }]
        };

        oStream.data = aJsonArray;

        // Überschreiben, des ursprünglichen Befehls
        aJsonArray = oStream;

        return aJsonArray;
    }

    this.getLSData = function (oDoc) {


        if (typeof this.oCache[this.sDocumentIDs][oDoc["source"]] === "undefined") {
            this.oCache[this.sDocumentIDs][oDoc["source"]] = {};
        }

        if (oDoc.act === "new") {
            // Cross-Domain-Tracking: Zur Übernahme der ID
            if (typeof oDoc._id !== "undefined") {
                var _id = oDoc._id;
            } else {
                var _id = this.getNewTrackId();
            }


            // Unterscheidung: Multiple
            // if(typeof oDoc.multiple !== "undefined" && oDoc.multiple === true)
            // {
            //     if(typeof oDocumentIds[oDoc.source][oDoc.doc] === "undefined")
            //     {
            //         oDocumentIds[oDoc.source][oDoc.doc] = [];
            //         oDocumentIds[oDoc.source][oDoc.doc].push(_id);
            //     }
            //     else if(typeof oDocumentIds[oDoc.source][oDoc.doc] === "string")
            //     {
            //         var sTemp = oDocumentIds[oDoc.source][oDoc.doc];
            //         oDocumentIds[oDoc.source][oDoc.doc] = [];
            //         oDocumentIds[oDoc.source][oDoc.doc].push(sTemp);
            //         oDocumentIds[oDoc.source][oDoc.doc].push(_id);
            //     }
            //     else if(typeof oDocumentIds[oDoc.source][oDoc.doc].push !== "undefined")
            //     {
            //         oDocumentIds[oDoc.source][oDoc.doc].push(_id);
            //     }
            // }
            // else
            // {
            // Überprüfen, ob es schon eine bestehende ID zum Doc gibt?

            if (
                typeof this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc] !== "undefined" &&
                (
                    typeof oDoc.bNoParentStorage === "undefined" ||
                    (
                        typeof oDoc.bNoParentStorage !== "undefined" && oDoc.bNoParentStorage !== true
                    )
                )
            ) {
                if (
                    typeof this.oCache[this.sDocumentIDs] !== "undefined" &&
                    typeof this.oCache[this.sDocumentIDs][oDoc.source] !== "undefined"
                ) {
                    if (typeof this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc] === "undefined") {
                        // Dokument noch nicht im Cache enthalten
                        this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc] = {
                            "_id": _id
                        };

                        if (typeof oDoc.parent !== "undefined") {
                            this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc].parent = oDoc.parent;
                        }
                    } else {
                        // Dokument bereits im Cache vorhanden
                        this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]["_id"] = _id;

                        // Dokument umhängen, wenn parent gleich ist
                        if (
                            typeof this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc].parent !== "undefined" &&
                            this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc].parent !== oDoc.parent
                        ) {
                            this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]["parent"] = oDoc.parent;
                            delete this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]["parentid"];
                        }
                    }
                }

                // Parent umhängen auf neues Dokument (wenn vorhanden), NUR wenn gleicher Parent!
                // if(
                //     typeof this.oCache[this.sParentCacheName][oDoc.source][this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]] !== "undefined" &&
                //     typeof this.oCache[this.sParentCacheName][oDoc.source][this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]].parentid !== "undefined" &&
                //     this.oCache[this.sParentCacheName][oDoc.source][this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]].parent === oDoc.parent
                // )
                // {
                //     sParentId = this.oCache[this.sParentCacheName][oDoc.source][this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]].parentid;
                // }
                //
                // // Verweise aller Dokumente auf neues Dokument umhängen
                // for(var keys in this.oCache[this.sParentCacheName][oDoc.source])
                // {
                //     if(
                //         typeof this.oCache[this.sParentCacheName][oDoc.source][keys] !== "undefined" &&
                //         typeof this.oCache[this.sParentCacheName][oDoc.source][keys].parentid !== "undefined" &&
                //         this.oCache[this.sParentCacheName][oDoc.source][keys].parentid === this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]
                //     )
                //     {
                //         this.oCache[this.sParentCacheName][oDoc.source][keys].parentid = _id;
                //     }
                // }
                //
                // // Parent-Beziehungen löschen zur alten ID
                // delete this.oCache[this.sParentCacheName][oDoc.source][this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]];
            } else {
                // Dokument noch nicht im Cache enthalten
                this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc] = {
                    "_id": _id
                };

                if (typeof this.oMultipleCache[oDoc.source] === "undefined") {
                    this.oMultipleCache[oDoc.source] = {};
                }

                this.oMultipleCache[oDoc.source][_id] = {
                    "_id": _id
                };

                if (typeof oDoc.parent !== "undefined") {
                    this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc].parent = oDoc.parent;
                    this.oMultipleCache[oDoc.source][_id].parent = oDoc.parent;
                }
            }

            return {
                _id: _id
            };
        } else if (oDoc.act === "upd") {
            if (
                typeof this.oCache[this.sDocumentIDs] !== "undefined" &&
                typeof this.oCache[this.sDocumentIDs][oDoc.source] !== "undefined" &&
                typeof this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc] !== "undefined"
            ) {
                return {
                    _id: this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]._id
                };
            } else {
                return {
                    _id: oDoc._id
                };
            }

        } else if (oDoc.act === "read") {
            if (
                typeof this.oCache[this.sDocumentIDs] !== "undefined" &&
                typeof this.oCache[this.sDocumentIDs][oDoc.source] !== "undefined" &&
                typeof this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc] !== "undefined" &&
                typeof this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]["_id"] !== "undefined"
            ) {
                return {
                    _id: this.oCache[this.sDocumentIDs][oDoc.source][oDoc.doc]["_id"]
                };
            } else {
                return null;
            }
        } else {
            return null;
        }
    };


    this.getParents = function (documentType, sSource) {


        var lastparent = documentType;
        var bSuccessfull = true;
        var aParentData2Track = {};
        while (
            typeof this.oCache[this.sDocumentIDs][sSource][lastparent].parent !== "undefined"
            ) {
            if (lastparent !== this.oCache[this.sDocumentIDs][sSource][lastparent].parent) {
                // Parent Daten in den Result schreiben
                aParentData2Track[this.oCache[this.sDocumentIDs][sSource][lastparent].parent] = this.oCache[this.sDocumentIDs][sSource][lastparent].parentid;
                lastparent = this.oCache[this.sDocumentIDs][sSource][lastparent].parent;
            } else {
                bSuccessfull = false;
                break;
            }
        }

        if (bSuccessfull) {
            return aParentData2Track;
        } else {
            return null;
        }
    }
    this.getNow = function () {

        return new Date().getTime();
    }
    this.getNewTrackId = function () {


        var sTime = this.getNow();
        var sRand1 = Math.round(Math.random() * 100000);
        var sRand2 = Math.round(Math.random() * 100000);

        return "" + sRand1 + sTime + sRand2;
    }

    this._construct();
});

window.jentis.tracker.registerGateConf("jentis.core.tracker.rawdata-controller", false,{
    oTrackDomains : {
        A : window.jentis.config.trackdomain
    },
    aTrackDomainsListing : ["A"],
    cookieName : "jts-rw"
});

window.jentis.tracker.registerGateLib("jentis.core.tracker.rawdata", function (jtsTracker, oGateConfig) {
    this.jtsTracker = jtsTracker;
    this.oGateConfig = oGateConfig;

    // ########## GATE-VARS ##########
    this.sPluginID = "jentis.core.tracker.rawdata"; // Defines the unique plugin JENTIS-ID

    // This array caches all outgoing links for the outgoing link tracking
    this.outgoingLinkArray = [];

    // Referrer-Caching for One-Page-Applications
    this.sTempReferrer = document.referrer;

    // This operator is true, if the jts-Submit command is fired
    this.bFinal = false;

    // Defines when the event "DOM-READY" is fired
    this.bDomReady = false;


    // ########## GATE-FUNCS ##########

    this._construct = function () {

        // BOT-Stop
        if (
            typeof this.oGateConfig.xBotExecution === "undefined" ||
            (
                typeof this.oGateConfig.xBotExecution !== "undefined" &&
                !this.oGateConfig.xBotExecution.test(window.navigator.userAgent)
            )
        ) {
            this.startUp();
            this.init();

            // ########## REGISTER-GATE-FUNCS ##########

            this.jtsTracker.registerGateFunc("pageview", this.trackPageView, this);

            this.jtsTracker.registerGateFunc("event", this.trackEvent, this);
            this.jtsTracker.registerGateFunc("userdata", this.trackUserData, this);
            this.jtsTracker.registerGateFunc("campaign", this.trackCampaign, this);
            this.jtsTracker.registerGateFunc("submit", this.trackFinal, this);

            this.jtsTracker.registerGateFunc("var", this.trackVar, this);
            this.jtsTracker.registerGateFunc("pagevar", this.trackPageVar, this);
            this.jtsTracker.registerGateFunc("sessionvar", this.trackSessionVar, this);
            this.jtsTracker.registerGateFunc("uservar", this.trackUserVar, this);

            this.jtsTracker.registerGateFunc("search", this.trackSearch, this);

            this.jtsTracker.registerGateFunc("productview", this.trackProductView, this);
            this.jtsTracker.registerGateFunc("addtocart", this.trackAddToCart, this);
            this.jtsTracker.registerGateFunc("removefromcart", this.trackRemoveFromCart, this);
            this.jtsTracker.registerGateFunc("cartview", this.trackCartView, this);
            this.jtsTracker.registerGateFunc("sale", this.trackSale, this);

            this.jtsTracker.registerGateFunc("category", this.trackCategory, this);
            this.jtsTracker.registerGateFunc("categoryview", this.trackCategoryView, this);
            this.jtsTracker.registerGateFunc("listview", this.trackListView, this);
            this.jtsTracker.registerGateFunc("productlist", this.trackProductList, this);
            this.jtsTracker.registerGateFunc("productlistclick", this.trackProductListClick, this);

            this.jtsTracker.registerGateFunc("trbobanner", this.trackTrboBanner, this);
            this.jtsTracker.registerGateFunc("promotionklick", this.trackPromotionClick, this);
            this.jtsTracker.registerGateFunc("promotionclick", this.trackPromotionClick, this);
            this.jtsTracker.registerGateFunc("download", this.trackDownload, this);
            this.jtsTracker.registerGateFunc("outlink", this.trackOutLink, this);

            this.jtsTracker.registerGateFunc("currentcart", this.trackCurrentCart, this);
            this.jtsTracker.registerGateFunc("checkout", this.trackCheckout, this);
            this.jtsTracker.registerGateFunc("checkoutoption", this.trackCheckoutOption, this);

            this.jtsTracker.registerGateFunc("newsletterreg", this.newsletterreg, this);
            this.jtsTracker.registerGateFunc("reservation", this.trackReservation, this);
            this.jtsTracker.registerGateFunc("recommendationclick", this.trackRecommendationClick, this);

        }

    };

    this.startUp = function () {
        //Load all Auto Functions onDomReady
        if (window.addEventListener) // Standard
        {
            window.addEventListener('load', this.domReady.bind(this), false);
        } else if (window.attachEvent) // old IE
        {
            window.attachEvent('onload', this.domReady.bind(this));
        }
    }

    this.domReady = function () {
        this.bDomReady = true;
        this.checkIfDomANDFinal();
    }

    this.checkIfDomANDFinal = function () {
        if (this.bDomReady === true && this.bFinal === true) {
            this.autoTrackerInit_onDomReady();
        }
    }

    // JENTIS Cross Domain Tracking - Add Jentis Param
    this.addUrlParamtoElement = function (sAttribute, oElement, sHref, param) {

        sHref += (sHref.split('?')[1] ? '&' : '?') + param;
        oElement.setAttribute(sAttribute, sHref);

    }

    this.autoTrackerInit_onDomReady = function () {
        if (
            typeof this.oGateConfig.xCrossDomainTracking !== "undefined" &&
            document.getElementsByTagName
        ) {
            // Get User and Session ID - Build Jentis Cross Domain Param-String
            var sUserID = this.jtsTracker.readCookie("jentis_raw_w18_webanalyzer_userid");
            var sSessionID = JSON.parse(this.jtsTracker.readCookie("jentis_raw_w18_webanalyzer"));
            var sJentisUrlParam = "jentis_raw_uid=" + sUserID + "&jentis_raw_sid=" + sSessionID.session.id;

            var aLinks = document.getElementsByTagName('a');
            for (var i = 0, iMax = aLinks.length; i < iMax; i++) {
                if (typeof aLinks[i].hostname !== "undefined" && aLinks[i].hostname.length > 0 && aLinks[i].hostname.match(this.oGateConfig.xCrossDomainTracking)) {
                    this.addUrlParamtoElement('href', aLinks[i], aLinks[i].href, sJentisUrlParam);
                }
            }

            var aForms = document.getElementsByTagName('form');
            for (var i = 0, iMax = aForms.length; i < iMax; i++) {
                if (typeof aForms[i].action !== "undefined" && aForms[i].action.length > 0 && aForms[i].action.match(this.oGateConfig.xCrossDomainTracking)) {
                    this.addUrlParamtoElement('action', aForms[i], aForms[i].action, sJentisUrlParam);
                }
            }

        }
    }

    this.init = function () {


        this.aCategorys = [];

        // TG4-Attributes not allowed
        this.aNotAllowedParams = ["products", "ecvars"];

        // Var-Handler
        this.oVars = {};

        // Event-Handler
        this.aEvents = [];

        // Multiple Product-Tracking
        this.bProductTracked = false;

        this.bNewUser = false;
        this.bNewSession = false;
        this.bNewCampaign = false;

        this.oDocumentParams = {};
    }

    this.trackDoc = function (oTrackDoc) {


        // Append Custom-Vars to Doc
        if (typeof oTrackDoc["prop"] === "object" && typeof this.oVars[oTrackDoc.doc] !== "undefined") {
            oTrackDoc.prop.customvars = this.oVars[oTrackDoc.doc];
        }

        // Send Data to Raw-Controller
        this.jtsTracker.track(oTrackDoc);

        // Custom-Data Reset after sending document
        this.oDocumentParams[oTrackDoc.doc] = false;

        if (oTrackDoc.doc !== "session") {
            this.trackSessionDocument();
        }
    }

    this.sendEventSingle = function (oDoc) {
        // Append Custom-Vars to Doc BEFORE trackDoc, because of a possible caching
        if (typeof oDoc["prop"] === "object" && typeof this.oVars[oDoc.doc] !== "undefined") {
            oDoc.prop.customvars = this.oVars[oDoc.doc];

            // Empty Object, because another Event could happen, with new vars
            this.oVars[oDoc.doc] = {};
        }

        this.sendEvent([oDoc]);
    }

    this.sendEvent = function (aDocs) {


        if (this.bFinal === false) {
            this.aEvents.push(aDocs);
        } else {
            for (var i = 0; i < aDocs.length; i++) {
                this.trackDoc(aDocs[i]);
            }

            this.sendDoc();
        }
    }

    this.sendDoc = function () {


        this.jtsTracker.track({
            track: "senddoc",
            source: this.sPluginID
        });
    }

    this.trackVar = function (oArgs) {


        if (typeof oArgs.type !== "undefined" && typeof oArgs.key !== "undefined" && oArgs.value !== "undefined") {
            if (typeof this.oVars[oArgs.type] === "undefined") {
                this.oVars[oArgs.type] = {};
            }
            this.oVars[oArgs.type][oArgs.key] = oArgs.value;
        }
    }

    this.trackPageVar = function (oArgs) {


        if (typeof oArgs.key !== "undefined" && oArgs.value !== "undefined") {
            this.trackVar({
                "type": "page",
                "key": oArgs.key,
                "value": oArgs.value
            });
        }
    }

    this.trackSessionVar = function (oArgs) {


        if (typeof oArgs.key !== "undefined" && oArgs.value !== "undefined") {
            this.trackVar({
                "type": "session",
                "key": oArgs.key,
                "value": oArgs.value
            });
        }
    }

    this.trackUserVar = function (oArgs) {


        if (typeof oArgs.key !== "undefined" && oArgs.value !== "undefined") {
            this.trackVar({
                "type": "user",
                "key": oArgs.key,
                "value": oArgs.value
            });
        }
    }

    this.trackUserDocument = function () {


        var self = this;
        var aUrlParams = this.fGetUrlParams();

        if (typeof aUrlParams["jentis_raw_uid"] !== "undefined") {
            var userid = aUrlParams["jentis_raw_uid"];
            self.bNewUser = true;

            var oDoc = {
                track: "trackdoc",
                act: "new",
                source: this.sPluginID,
                doc: "user",
                _id: userid
            };

            self.trackVar({
                "type": "user",
                "key": "w18rawuserid",
                "value": userid
            });

            self.jtsTracker.setCookie({
                "name": self.oGateConfig.sStoragePrefix + "_uid",
                "value": userid,
                "exdays": self.oGateConfig.iStorageDuration
            });

            if (self.oDocumentParams.user !== false) {
                oDoc.prop = self.oDocumentParams.user;
            }

            this.jtsTracker.track(oDoc);
        } else {
            this.jtsTracker.track({
                track: "readdoc",
                source: this.sPluginID,
                doc: "user",
                cb: function (oData) {
                    var oDoc = {
                        track: "trackdoc",
                        doc: "user",
                        act: "upd",
                        source: self.sPluginID
                    };

                    if (oData === null) {
                        oDoc.act = "new";
                        self.bNewUser = true;
                    } else {
                        oDoc._id = oData._id;

                        self.trackVar({
                            "type": "user",
                            "key": "w18rawuserid",
                            "value": oDoc._id
                        });

                        self.jtsTracker.setCookie({
                            "name": self.oGateConfig.sStoragePrefix + "_uid",
                            "value": oDoc._id,
                            "exdays": self.oGateConfig.iStorageDuration
                        });
                    }

                    if (self.existDocumentParams("user") !== false) {
                        oDoc.prop = self.oDocumentParams.user;
                    } else if (typeof self.oVars["user"] !== "undefined") {
                        // Fallback: If custom_vars are waiting in trackDoc, we have to inform the tracking here
                        oDoc.prop = {};
                    }

                    // Nur Absenden, wenn
                    // 1) Ein neuer User angelegt werden soll
                    // 2) Der User mit Properties angereichert wurde
                    if (
                        typeof oDoc.prop !== "undefined" ||
                        oDoc.act === "new"
                    ) {
                        oDoc.cb = function (oData) {
                            if (typeof oData !== "undefined" && typeof oData._id !== "undefined") {
                                var aUserProperties = [];
                                aUserProperties.push({
                                    "key": "w18rawuserid",
                                    "value": oData._id
                                });

                                self.jtsTracker.setCookie({
                                    "name": self.oGateConfig.sStoragePrefix + "_uid",
                                    "value": oData._id,
                                    "exdays": self.oGateConfig.iStorageDuration
                                });

                                // CallbacksForNewUser
                                if (
                                    typeof self.bNewUser !== "undefined" &&
                                    typeof window.jtsNamespace !== "undefined" &&
                                    typeof window.jtsNamespace.jtsCallbacks !== "undefined" &&
                                    typeof window.jtsNamespace.jtsCallbacks.rawUserCallback !== "undefined"
                                ) {
                                    for (var iRawUserCallbackIterator = 0; iRawUserCallbackIterator < window.jtsNamespace.jtsCallbacks.rawUserCallback.length; iRawUserCallbackIterator++) {
                                        window.jtsNamespace.jtsCallbacks.rawUserCallback[iRawUserCallbackIterator].apply(this, [oData._id, self.bNewUser]);
                                    }
                                }

                                if (typeof oData.cb !== "undefined") {
                                    oData.cb({
                                        "properties": aUserProperties
                                    });
                                }
                            }
                        };

                        self.trackDoc(oDoc);
                    }
                }
            });
        }
    }

    this.trackSessionDocument = function () {


        var self = this;
        var oDoc = false;
        var aUrlParams = this.fGetUrlParams();

        // Cross-Domain-Tracking: Bestehende Cookies löschen und neu setzen
        if (
            this.bNewSession === false &&
            typeof aUrlParams["jentis_raw_sid"] !== "undefined"
        ) {
            // Bestehendes Cookie löschen
            this.jtsTracker.setCookie({
                "name": this.oGateConfig.sStoragePrefix + "_sid",
                "value": "",
                "exdays": -1
            });
        }

        var iSessionID = this.jtsTracker.readCookie(this.oGateConfig.sStoragePrefix + "_sid");

        this.trackDocumentParameter("session", "jts_version", window.jentis.config.frontend.vers);

        if (iSessionID !== null) {
            this.trackDocumentParameter("session", "session-id", iSessionID);

            // 1) Hat jemand die User Infos gelöscht? (Parent-Localstorage Object)
            if (
                this.bNewUser === true &&
                this.bNewSession === false
            ) {
                this.trackNavigatorInformation();

                oDoc = {
                    track: "trackdoc",
                    doc: "session",
                    act: "new",
                    parent: "user",
                    source: this.sPluginID,
                    prop: (this.existDocumentParams("session") !== false) ? this.oDocumentParams.session : {}
                };

                this.bNewSession = true;
            } else {
                // Update zur Sicherheit immer durchführen
                this.trackNavigatorInformation();

                // Update durchführen, wenn es zusätzliche Properties gibt
                if (this.existDocumentParams("session") !== false) {
                    oDoc = {
                        track: "trackdoc",
                        doc: "session",
                        act: "upd",
                        parent: "user",
                        source: this.sPluginID,
                        prop: this.oDocumentParams.session
                    };
                }
            }

        } else {
            this.trackNavigatorInformation();

            oDoc = {
                track: "trackdoc",
                doc: "session",
                act: "new",
                parent: "user",
                source: this.sPluginID,
                prop: (this.existDocumentParams("session") !== false) ? this.oDocumentParams.session : {}
            };

            if (typeof aUrlParams["jentis_raw_sid"] !== "undefined") {
                oDoc._id = aUrlParams["jentis_raw_sid"];
            }

            this.bNewSession = true;
        }

        // Merkvariable zurücksetzen
        this.bNewUser = false;

        if (oDoc !== false) {
            oDoc.cb = function (oData) {
                self.jtsTracker.setCookie({
                    "name": self.oGateConfig.sStoragePrefix + "_sid",
                    "value": oData._id,
                    "exdays": self.oGateConfig.iSessionDuration
                });

                self.trackDocumentParameter("session", "session-id", oData._id);

                try {
                    if (
                        typeof window.tgNamespace !== "undefined" &&
                        typeof window.tgNamespace.tgContainer !== "undefined" &&
                        typeof window.tgNamespace.tgContainer.oInnerGates !== "undefined" &&
                        typeof window.tgNamespace.tgContainer.oInnerGates["ua"] !== "undefined"
                    ) {
                        self.jtsTracker.exeInnerFunction("ua", "sessionvar", {
                            "key": "sessionId",
                            "value": oData._id
                        });
                    }
                } catch (ex) {
                    self.jtsTracker.log("["+this.sPluginID+"] - FYI: NO INNER GATE UA EXISTING FOR SESSION-VAR PLACING IN trackSessionDocument()");
                }

            }
            this.trackDoc(oDoc);
        }
    };

    this.trackNavigatorInformation = function () {


        if (typeof window.navigator !== "undefined") {
            this.trackDocumentParameter("session", "navigator-cookieEnabled", window.navigator.cookieEnabled);
            this.trackDocumentParameter("session", "navigator-appName", window.navigator.appName);
            this.trackDocumentParameter("session", "navigator-appCodeName", window.navigator.appCodeName);
            this.trackDocumentParameter("session", "navigator-product", window.navigator.product);
            this.trackDocumentParameter("session", "navigator-appVersion", window.navigator.appVersion);
            this.trackDocumentParameter("session", "navigator-userAgent", window.navigator.userAgent);
            this.trackDocumentParameter("session", "navigator-platform", window.navigator.platform);
            this.trackDocumentParameter("session", "navigator-language", window.navigator.language);
            this.trackDocumentParameter("session", "navigator-onLine", window.navigator.onLine);
            this.trackDocumentParameter("session", "navigator-javaEnabled", window.navigator.javaEnabled());
        }

        // Screen Size
        if (typeof window.screen !== "undefined") {
            this.trackDocumentParameter("session", "window-screen-width", window.screen.width);
            this.trackDocumentParameter("session", "window-screen-height", window.screen.height);
            this.trackDocumentParameter("session", "window-screen-colorDepth", window.screen.colorDepth);
            this.trackDocumentParameter("session", "window-screen-pixelDepth", window.screen.pixelDepth);
        }

        // Viewport
        this.trackDocumentParameter("session", "window-viewport-width", window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth);
        this.trackDocumentParameter("session", "window-viewport-height", window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight);

        // Character-Encoding
        this.trackDocumentParameter("session", "character-encoding", document.characterSet);

        // Timezone Difference
        var date = new Date();
        if (typeof date.getTimezoneOffset() !== "undefined") {
            this.trackDocumentParameter("session", "timezone-offset", date.getTimezoneOffset() * 60 * 1000);
        }

    }

    this.trackCampaign = function (oArgs) {


        // Case #2: TG4-Campaign Kommando
        this.bNewCampaign = true;

        this.saveDocumentParams("campaign", oArgs);
    }

    this.trackCampaignDocument = function () {


        // Case #1: Andere Domain
        if
        (
            (this.sTempReferrer !== "" &&
                this.parseUri(this.sTempReferrer).host !== document.location.host) ||
            (this.sTempReferrer === "")
        ) {
            this.bNewCampaign = true;
        }

        // Neue Kampagne
        if (this.bNewSession === true || this.bNewCampaign === true) {
            this.trackDocumentParameter("campaign", "referrer", this.sTempReferrer);

            this.trackDoc({
                track: "trackdoc",
                doc: "campaign",
                act: "new",
                parent: "session",
                source: this.sPluginID,
                prop: (this.existDocumentParams("campaign") !== false) ? this.oDocumentParams.campaign : {}
            });
        }
    }

    this.trackPageDocument = function () {


        this.trackDocumentParameter("page", "urlparams", this.fGetUrlParams());
        this.trackDocumentParameter("page", "cookies", this.getCookies());

        this.trackDoc({
            track: "trackdoc",
            doc: "page",
            act: "new",
            parent: "campaign",
            source: this.sPluginID,
            prop: (this.existDocumentParams("page") !== false) ? this.oDocumentParams.page : {}
        });
    }

    this.trackFinal = function () {


        this.jtsTracker.log("["+this.sPluginID+"] - Final - Called");

        this.trackUserDocument();
        this.trackCampaignDocument();

        this.trackPageView();
        this.trackPageDocument();

        this.sendDoc();

        this.bFinal = true;

        this.checkIfDomANDFinal();

        // Event-Cache verarbeiten
        for (var i = 0; i < this.aEvents.length; i++) {
            for (var iDocIterator = 0; iDocIterator < this.aEvents[i].length; iDocIterator++) {
                this.trackDoc(this.aEvents[i][iDocIterator]);
            }

            this.sendDoc();
        }

        // Update-Referrer für One-Page-App
        this.sTempReferrer = document.location.href;

        this.init();
    };

    this.existDocumentParams = function (sDoc) {
        if (
            typeof this.oDocumentParams[sDoc] === "undefined" ||
            (
                typeof this.oDocumentParams[sDoc] !== "undefined" && this.oDocumentParams[sDoc] === false
            )
        ) {
            return false;
        }

        return true;
    }

    this.trackDocumentParameter = function (sDoc, key, value) {


        if (typeof this.oDocumentParams[sDoc] === "undefined" || this.oDocumentParams[sDoc] === false) {
            this.oDocumentParams[sDoc] = {};
        }

        if (typeof value !== "undefined" && value !== null) {
            this.oDocumentParams[sDoc][key] = value;
        }
    }

    //###################
    //Content Tracking
    //###################

    this.trackPageView = function (oArgs) {


        // Ein Pageview hat die macht, das Event-Caching zu aktivieren!
        this.bFinal = false;

        this.trackDocumentParameter("page", "href", document.location.href);
        this.trackDocumentParameter("page", "pagetitle", document.title);

        for (var key in oArgs) {
            this.trackDocumentParameter("page", key, oArgs[key]);
        }
    }

    this.trackEvent = function (oArgs) {


        this.saveDocumentParams("event", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "event",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        this.sendEventSingle(oDoc);
    }

    this.newsletterreg = function (oArgs) {


        this.saveDocumentParams("newsletterregistration", oArgs);

        this.trackDoc({
            track: "trackdoc",
            doc: "newsletterregistration",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: (this.existDocumentParams("newsletterregistration") !== false) ? this.oDocumentParams.newsletterregistration : {}
        });
    }

    this.trackCategory = function (oArgs) {


        this.aCategorys.push(oArgs);
    }

    this.trackCategoryView = function (oArgs) {


        var oPageCategory = {};

        for (var key in oArgs) {
            if (oArgs[key] !== null) {
                oPageCategory["category-" + key] = oArgs[key];
            }
        }

        if (this.aCategorys.length > 0) {
            for (var i = 0; i < this.aCategorys.length; i++) {
                var oCategory = this.aCategorys[i];

                for (var key in oCategory) {
                    if (oCategory[key] !== null) {
                        oPageCategory["category-" + i + "-" + key] = oCategory[key];
                    }
                }
            }
        }

        this.trackDocumentParameter("page", "category", oPageCategory);
    }

    this.trackOutLink = function (oArgs) {


        this.saveDocumentParams("outlink", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "outlink",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        this.sendEventSingle(oDoc);
    }

    this.trackUserData = function (oArgs) {


        for (var key in oArgs) {
            this.trackVar({
                "type": "user",
                "key": key,
                "value": oArgs[key]
            });
        }
    }

    this.trackSearch = function (oArgs) {


        this.saveDocumentParams("search", oArgs);

        this.trackDoc({
            track: "trackdoc",
            doc: "search",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: (this.existDocumentParams("search") !== false) ? this.oDocumentParams.search : {}
        });

        this.trackProductHelper("search", oArgs.products);
    }

    this.trackReservation = function (oArgs) {


        this.saveDocumentParams("reservation", oArgs);

        this.trackDoc({
            track: "trackdoc",
            doc: "reservation",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: (this.existDocumentParams("reservation") !== false) ? this.oDocumentParams.reservation : {}
        });

        this.trackProductHelper("reservation", oArgs.products);
    }

    this.trackProductHelper = function (sType, aProducts, bReturn) {


        var iLength = this.getProductLength(sType, aProducts);

        var aReturn = [];

        for (var i = 0; i < iLength; i++) {
            var oProduct = aProducts[i];

            // Vars
            var oCustomVars = {};
            if (typeof oProduct.ecvars !== "undefined") {
                for (var i = 0; i < oProduct.ecvars.length; i++) {
                    oCustomVars[oProduct.ecvars[i].key] = oProduct.ecvars[i].value;
                }
            }

            this.trackDocumentParameter("product", "customvars", oCustomVars);

            // Position Setting
            this.trackDocumentParameter("product", "position", i + 1);

            // Iterate through all attributes of the product
            this.saveDocumentParams("product", oProduct, ["group", "ecvars", "_type"]);

            // Group: Unterschied Array / Object
            if (typeof oProduct.group !== "undefined") {
                if (typeof oProduct.group === "object") {
                    if (Object.prototype.toString.call(oProduct.group) == '[object Array]') {
                        // Array
                        this.trackDocumentParameter("product", "group", oProduct.group);
                    } else {
                        // Object
                        var aResult = [];
                        for (var key in oProduct.group) {
                            aResult.push(oProduct.group[key]);
                        }

                        this.trackDocumentParameter("product", "group", aResult);
                    }
                } else {
                    this.trackDocumentParameter("product", "group", oProduct.group);
                }
            }

            // 1.Produkt überschreibt das Tracking der letzten Produkte

            var oProductDoc = {
                track: "trackdoc",
                doc: "product",
                act: "new",
                parent: sType,
                productParent: sType,
                bNoParentStorage: true,
                source: this.sPluginID,
                prop: (this.existDocumentParams("product") !== false) ? this.jtsTracker.cloneObject(this.oDocumentParams.product) : {}
            };

            if (this.bProductTracked === false) {
                oProductDoc["multiple"] = false;
                this.bProductTracked = true;
            } else {
                oProductDoc["multiple"] = true;
            }

            if (typeof bReturn !== "undefined" && bReturn === true) {
                aReturn.push(oProductDoc);
            } else {
                this.trackDoc(oProductDoc);
            }

            this.oDocumentParams.product = {};
        }

        if (typeof bReturn !== "undefined" && bReturn === true) {
            return aReturn;
        }
    }

    //###################
    //ECommerce Tracking
    //###################

    this.trackCheckout = function (oArgs) {


        this.saveDocumentParams("checkout", oArgs);

        this.trackDoc({
            track: "trackdoc",
            doc: "checkout",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: (this.existDocumentParams("checkout") !== false) ? this.oDocumentParams.checkout : {}
        });

        this.trackProductHelper("checkout", oArgs.products);
    }

    this.trackCheckoutOption = function (oArgs) {


        this.saveDocumentParams("checkoutoption", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "checkoutoption",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        this.sendEventSingle(oDoc);
    }

    this.trackCurrentCart = function (oArgs) {


        this.saveDocumentParams("currentcart", oArgs);

        this.trackDoc({
            track: "trackdoc",
            doc: "currentcart",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: (this.existDocumentParams("currentcart") !== false) ? this.oDocumentParams.currentcart : {}
        });

        this.trackProductHelper("currentcart", oArgs.products);
    }

    this.trackProductList = function (oArgs) {


        this.saveDocumentParams("productlist", oArgs);

        this.trackListView(oArgs);
    }

    this.trackProductListClick = function (oArgs) {


        this.saveDocumentParams("productlistclick", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "productlistclick",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        var aAllDocuments = this.trackProductHelper("productlistclick", oArgs.products, true);
        aAllDocuments.push(oDoc);

        this.sendEvent(aAllDocuments);
    }

    this.trackRecommendationClick = function (oArgs) {


        this.saveDocumentParams("recommendationclick", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "recommendationclick",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        var aAllDocuments = this.trackProductHelper("recommendationclick", oArgs.products, true);
        aAllDocuments.push(oDoc);

        this.sendEvent(aAllDocuments);
    }

    this.trackTrboBanner = function (oArgs) {


        this.saveDocumentParams("trbobanner", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "trbobanner",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        this.sendEventSingle(oDoc);
    }

    this.trackDownload = function (oArgs) {


        this.saveDocumentParams("download", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "download",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        this.sendEventSingle(oDoc);
    }

    this.trackPromotionClick = function (oArgs) {


        this.saveDocumentParams("promotionclick", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "promotionclick",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        this.sendEventSingle(oDoc);
    }

    this.trackListView = function (oArgs) {


        this.saveDocumentParams("productlist", oArgs);

        this.trackDoc({
            track: "trackdoc",
            doc: "productlist",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: (this.existDocumentParams("productlist") !== false) ? this.oDocumentParams.productlist : {}
        });

        this.trackProductHelper("productlist", oArgs.products);
    }

    this.trackProductView = function (oArgs) {


        this.saveDocumentParams("productview", oArgs);

        this.trackDoc({
            track: "trackdoc",
            doc: "productview",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: (this.existDocumentParams("productview") !== false) ? this.oDocumentParams.productview : {}
        });

        this.trackProductHelper("productview", oArgs.products);
    }


    this.trackAddToCart = function (oArgs) {


        this.saveDocumentParams("addtocart", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "addtocart",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        var aAllDocuments = this.trackProductHelper("addtocart", oArgs.products, true);
        aAllDocuments.push(oDoc);

        this.sendEvent(aAllDocuments);
    }

    this.trackRemoveFromCart = function (oArgs) {


        this.saveDocumentParams("removefromcart", oArgs);

        var oDoc = {
            track: "trackdoc",
            doc: "removefromcart",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: {}
        };

        if (this.existDocumentParams(oDoc.doc) !== false) {
            oDoc["prop"] = this.jtsTracker.cloneObject(this.oDocumentParams[oDoc.doc]);
            this.oDocumentParams[oDoc.doc] = false;
        }

        var aAllDocuments = this.trackProductHelper("removefromcart", oArgs.products, true);
        aAllDocuments.push(oDoc);

        this.sendEvent(aAllDocuments);
    }

    this.trackCartView = function (oArgs) {


        this.saveDocumentParams("cartview", oArgs);

        this.trackDoc({
            track: "trackdoc",
            doc: "cartview",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: (this.existDocumentParams("cartview") !== false) ? this.oDocumentParams.cartview : {}
        });

        this.trackProductHelper("cartview", oArgs.products);
    }

    this.trackSale = function (oArgs) {


        this.saveDocumentParams("order", oArgs);

        this.trackDoc({
            track: "trackdoc",
            doc: "order",
            act: "new",
            parent: "page",
            source: this.sPluginID,
            prop: (this.existDocumentParams("order") !== false) ? this.oDocumentParams.order : {}
        });

        this.trackProductHelper("order", oArgs.products);
    }

    this.saveDocumentParams = function (sDoc, oArgs, aAttributesToIgnore) {
        for (var key in oArgs) {

            if (this.aNotAllowedParams.includes(key)) {
                continue;
            }

            if (typeof aAttributesToIgnore !== "undefined" && aAttributesToIgnore.includes(key)) {
                continue;
            }

            // FALLBACK: ECVARS to CUSTOMVARS
            if (typeof oArgs.ecvars !== "undefined") {
                for (var i = 0; i < oArgs.ecvars.length; i++) {
                    this.trackVar({
                        "type": sDoc,
                        "key": oArgs.ecvars[i].key,
                        "value": oArgs.ecvars[i].value
                    });
                }
            }

            this.trackDocumentParameter(sDoc, key, oArgs[key]);
        }
    }

    this.getNow = function () {
        return new Date().getTime();
    }

    this.parseUri = function (str) {
        var o = this.parseUri.options,
            m = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
            uri = {},
            i = 14;

        while (i--) uri[o.key[i]] = m[i] || "";

        uri[o.q.name] = {};
        uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
            if ($1) uri[o.q.name][$1] = $2;
        });

        return uri;
    };

    this.parseUri.options = {
        strictMode: false,
        key: ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"],
        q: {
            name: "queryKey",
            parser: /(?:^|&)([^&=]*)=?([^&]*)/g
        },
        parser: {
            strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
            loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
        }
    };

    this.getProductLength = function (sType, aProducts) {


        if (
            typeof this.oGateConfig.oProductCounter !== "undefined" &&
            typeof this.oGateConfig.oProductCounter[sType] !== "undefined"
        ) {
            if (aProducts.length <= this.oGateConfig.oProductCounter[sType]) {
                return aProducts.length;
            } else {
                //+1 damit die for-schleife wie immer mit "<=" funktioniert!
                return this.oGateConfig.oProductCounter[sType] + 1;
            }
        } else {
            return aProducts.length;
        }
    }

    this.getCookies = function () {

        var cookies = {};

        if (document.cookie && document.cookie != '') {
            var split = document.cookie.split(';');
            for (var i = 0; i < split.length; i++) {
                var name_value = split[i].split("=");
                name_value[0] = name_value[0].replace(/^ /, '');
                name_value[0] = name_value[0].replace("$", "DOLLARSIGN");
                cookies[decodeURIComponent(name_value[0])] = decodeURIComponent(name_value[1]);
            }
        }

        return cookies;
    }

    this.fGetUrlParams = function () {
        var urlParams = "";
        (window.onpopstate = function () {
            var match,
                pl = /\+/g,  // Regex for replacing addition symbol with a space
                search = /([^&=]+)=?([^&]*)/g,
                decode = function (s) {
                    return window.decodeURIComponent(s.replace(pl, " "));
                },
                query = window.location.search.substring(1);

            urlParams = {};
            while (match = search.exec(query)) {
                urlParams[decode(match[1].replace("$", "DOLLARSIGN"))] = decode(match[2]);
            }
        })();
        return urlParams;
    }

    this._construct();
});
window.jentis.tracker.registerGateConf("jentis.core.tracker.rawdata",false,{
    sStoragePrefix : "jctr",                  // Defines the prefix of the cookies stored
    iStorageDuration : 60*60*24*365*2,         // Defines the duration time of the storage (in milliseconds)
    iSessionDuration : 30*60*1000,             // Defines the duration time of the session (in milliseconds)
    //xBotExecution : /.*(adsbot|googlebot|bingbot|slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|facebot|facebookexternalhit|ia_archiver|AdsBot-Google-Mobile|AdsBot-Google|Mediapartners-Google|BingPreview).*/gi,
    oProductCounter : {
        "productlist" : 20,
        "search" : 20
    }
});

window.jentis.tracker.registerGateLib("jentis.core.jtm.plugin.backend.ga1",function (jtsTracker, oGateConfig) {
    this.jtsTracker = jtsTracker;
    this.oGateConfig = oGateConfig;

    this.sendStream = function(args) {
        var http = new XMLHttpRequest();
        var url = args[0];
        http.open('GET', url, true);

        //Send the proper header information along with the request
        http.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

        var self = this;
        http.onreadystatechange = function () {//Call a function when the state changes.
            if (http.readyState == 4 && http.status == 200) {
                if (typeof fCallback === "function") {
                    fCallback.apply(self, [http]);
                }
            }
        }
        http.send();
    }

    this._construct = function () {

        // ########## REGISTER-GATE-FUNCS ##########

        this.jtsTracker.registerGateFunc("sendStream", this.sendStream, this);
    };


    this._construct();
});

window.jentis.tracker.registerGateConf("jentis.core.jtm.plugin.backend.ga1",1,{ 
});

