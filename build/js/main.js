(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*!
 * VERSION: 1.18.0
 * DATE: 2015-09-05
 * UPDATES AND DOCS AT: http://greensock.com
 *
 * @license Copyright (c) 2008-2015, GreenSock. All rights reserved.
 * This work is subject to the terms at http://greensock.com/standard-license or for
 * Club GreenSock members, the software agreement that was issued with your membership.
 *
 * @author: Jack Doyle, jack@greensock.com
 */
var _gsScope = (typeof(module) !== "undefined" && module.exports && typeof(global) !== "undefined") ? global : this || window; //helps ensure compatibility with AMD/RequireJS and CommonJS/Node
(_gsScope._gsQueue || (_gsScope._gsQueue = [])).push( function() {

	"use strict";

	_gsScope._gsDefine("plugins.CSSPlugin", ["plugins.TweenPlugin","TweenLite"], function(TweenPlugin, TweenLite) {

		/** @constructor **/
		var CSSPlugin = function() {
				TweenPlugin.call(this, "css");
				this._overwriteProps.length = 0;
				this.setRatio = CSSPlugin.prototype.setRatio; //speed optimization (avoid prototype lookup on this "hot" method)
			},
			_globals = _gsScope._gsDefine.globals,
			_hasPriority, //turns true whenever a CSSPropTween instance is created that has a priority other than 0. This helps us discern whether or not we should spend the time organizing the linked list or not after a CSSPlugin's _onInitTween() method is called.
			_suffixMap, //we set this in _onInitTween() each time as a way to have a persistent variable we can use in other methods like _parse() without having to pass it around as a parameter and we keep _parse() decoupled from a particular CSSPlugin instance
			_cs, //computed style (we store this in a shared variable to conserve memory and make minification tighter
			_overwriteProps, //alias to the currently instantiating CSSPlugin's _overwriteProps array. We use this closure in order to avoid having to pass a reference around from method to method and aid in minification.
			_specialProps = {},
			p = CSSPlugin.prototype = new TweenPlugin("css");

		p.constructor = CSSPlugin;
		CSSPlugin.version = "1.18.0";
		CSSPlugin.API = 2;
		CSSPlugin.defaultTransformPerspective = 0;
		CSSPlugin.defaultSkewType = "compensated";
		CSSPlugin.defaultSmoothOrigin = true;
		p = "px"; //we'll reuse the "p" variable to keep file size down
		CSSPlugin.suffixMap = {top:p, right:p, bottom:p, left:p, width:p, height:p, fontSize:p, padding:p, margin:p, perspective:p, lineHeight:""};


		var _numExp = /(?:\d|\-\d|\.\d|\-\.\d)+/g,
			_relNumExp = /(?:\d|\-\d|\.\d|\-\.\d|\+=\d|\-=\d|\+=.\d|\-=\.\d)+/g,
			_valuesExp = /(?:\+=|\-=|\-|\b)[\d\-\.]+[a-zA-Z0-9]*(?:%|\b)/gi, //finds all the values that begin with numbers or += or -= and then a number. Includes suffixes. We use this to split complex values apart like "1px 5px 20px rgb(255,102,51)"
			_NaNExp = /(?![+-]?\d*\.?\d+|[+-]|e[+-]\d+)[^0-9]/g, //also allows scientific notation and doesn't kill the leading -/+ in -= and +=
			_suffixExp = /(?:\d|\-|\+|=|#|\.)*/g,
			_opacityExp = /opacity *= *([^)]*)/i,
			_opacityValExp = /opacity:([^;]*)/i,
			_alphaFilterExp = /alpha\(opacity *=.+?\)/i,
			_rgbhslExp = /^(rgb|hsl)/,
			_capsExp = /([A-Z])/g,
			_camelExp = /-([a-z])/gi,
			_urlExp = /(^(?:url\(\"|url\())|(?:(\"\))$|\)$)/gi, //for pulling out urls from url(...) or url("...") strings (some browsers wrap urls in quotes, some don't when reporting things like backgroundImage)
			_camelFunc = function(s, g) { return g.toUpperCase(); },
			_horizExp = /(?:Left|Right|Width)/i,
			_ieGetMatrixExp = /(M11|M12|M21|M22)=[\d\-\.e]+/gi,
			_ieSetMatrixExp = /progid\:DXImageTransform\.Microsoft\.Matrix\(.+?\)/i,
			_commasOutsideParenExp = /,(?=[^\)]*(?:\(|$))/gi, //finds any commas that are not within parenthesis
			_DEG2RAD = Math.PI / 180,
			_RAD2DEG = 180 / Math.PI,
			_forcePT = {},
			_doc = document,
			_createElement = function(type) {
				return _doc.createElementNS ? _doc.createElementNS("http://www.w3.org/1999/xhtml", type) : _doc.createElement(type);
			},
			_tempDiv = _createElement("div"),
			_tempImg = _createElement("img"),
			_internals = CSSPlugin._internals = {_specialProps:_specialProps}, //provides a hook to a few internal methods that we need to access from inside other plugins
			_agent = navigator.userAgent,
			_autoRound,
			_reqSafariFix, //we won't apply the Safari transform fix until we actually come across a tween that affects a transform property (to maintain best performance).

			_isSafari,
			_isFirefox, //Firefox has a bug that causes 3D transformed elements to randomly disappear unless a repaint is forced after each update on each element.
			_isSafariLT6, //Safari (and Android 4 which uses a flavor of Safari) has a bug that prevents changes to "top" and "left" properties from rendering properly if changed on the same frame as a transform UNLESS we set the element's WebkitBackfaceVisibility to hidden (weird, I know). Doing this for Android 3 and earlier seems to actually cause other problems, though (fun!)
			_ieVers,
			_supportsOpacity = (function() { //we set _isSafari, _ieVers, _isFirefox, and _supportsOpacity all in one function here to reduce file size slightly, especially in the minified version.
				var i = _agent.indexOf("Android"),
					a = _createElement("a");
				_isSafari = (_agent.indexOf("Safari") !== -1 && _agent.indexOf("Chrome") === -1 && (i === -1 || Number(_agent.substr(i+8, 1)) > 3));
				_isSafariLT6 = (_isSafari && (Number(_agent.substr(_agent.indexOf("Version/")+8, 1)) < 6));
				_isFirefox = (_agent.indexOf("Firefox") !== -1);
				if ((/MSIE ([0-9]{1,}[\.0-9]{0,})/).exec(_agent) || (/Trident\/.*rv:([0-9]{1,}[\.0-9]{0,})/).exec(_agent)) {
					_ieVers = parseFloat( RegExp.$1 );
				}
				if (!a) {
					return false;
				}
				a.style.cssText = "top:1px;opacity:.55;";
				return /^0.55/.test(a.style.opacity);
			}()),
			_getIEOpacity = function(v) {
				return (_opacityExp.test( ((typeof(v) === "string") ? v : (v.currentStyle ? v.currentStyle.filter : v.style.filter) || "") ) ? ( parseFloat( RegExp.$1 ) / 100 ) : 1);
			},
			_log = function(s) {//for logging messages, but in a way that won't throw errors in old versions of IE.
				if (window.console) {
					console.log(s);
				}
			},

			_prefixCSS = "", //the non-camelCase vendor prefix like "-o-", "-moz-", "-ms-", or "-webkit-"
			_prefix = "", //camelCase vendor prefix like "O", "ms", "Webkit", or "Moz".

			// @private feed in a camelCase property name like "transform" and it will check to see if it is valid as-is or if it needs a vendor prefix. It returns the corrected camelCase property name (i.e. "WebkitTransform" or "MozTransform" or "transform" or null if no such property is found, like if the browser is IE8 or before, "transform" won't be found at all)
			_checkPropPrefix = function(p, e) {
				e = e || _tempDiv;
				var s = e.style,
					a, i;
				if (s[p] !== undefined) {
					return p;
				}
				p = p.charAt(0).toUpperCase() + p.substr(1);
				a = ["O","Moz","ms","Ms","Webkit"];
				i = 5;
				while (--i > -1 && s[a[i]+p] === undefined) { }
				if (i >= 0) {
					_prefix = (i === 3) ? "ms" : a[i];
					_prefixCSS = "-" + _prefix.toLowerCase() + "-";
					return _prefix + p;
				}
				return null;
			},

			_getComputedStyle = _doc.defaultView ? _doc.defaultView.getComputedStyle : function() {},

			/**
			 * @private Returns the css style for a particular property of an element. For example, to get whatever the current "left" css value for an element with an ID of "myElement", you could do:
			 * var currentLeft = CSSPlugin.getStyle( document.getElementById("myElement"), "left");
			 *
			 * @param {!Object} t Target element whose style property you want to query
			 * @param {!string} p Property name (like "left" or "top" or "marginTop", etc.)
			 * @param {Object=} cs Computed style object. This just provides a way to speed processing if you're going to get several properties on the same element in quick succession - you can reuse the result of the getComputedStyle() call.
			 * @param {boolean=} calc If true, the value will not be read directly from the element's "style" property (if it exists there), but instead the getComputedStyle() result will be used. This can be useful when you want to ensure that the browser itself is interpreting the value.
			 * @param {string=} dflt Default value that should be returned in the place of null, "none", "auto" or "auto auto".
			 * @return {?string} The current property value
			 */
			_getStyle = CSSPlugin.getStyle = function(t, p, cs, calc, dflt) {
				var rv;
				if (!_supportsOpacity) if (p === "opacity") { //several versions of IE don't use the standard "opacity" property - they use things like filter:alpha(opacity=50), so we parse that here.
					return _getIEOpacity(t);
				}
				if (!calc && t.style[p]) {
					rv = t.style[p];
				} else if ((cs = cs || _getComputedStyle(t))) {
					rv = cs[p] || cs.getPropertyValue(p) || cs.getPropertyValue(p.replace(_capsExp, "-$1").toLowerCase());
				} else if (t.currentStyle) {
					rv = t.currentStyle[p];
				}
				return (dflt != null && (!rv || rv === "none" || rv === "auto" || rv === "auto auto")) ? dflt : rv;
			},

			/**
			 * @private Pass the target element, the property name, the numeric value, and the suffix (like "%", "em", "px", etc.) and it will spit back the equivalent pixel number.
			 * @param {!Object} t Target element
			 * @param {!string} p Property name (like "left", "top", "marginLeft", etc.)
			 * @param {!number} v Value
			 * @param {string=} sfx Suffix (like "px" or "%" or "em")
			 * @param {boolean=} recurse If true, the call is a recursive one. In some browsers (like IE7/8), occasionally the value isn't accurately reported initially, but if we run the function again it will take effect.
			 * @return {number} value in pixels
			 */
			_convertToPixels = _internals.convertToPixels = function(t, p, v, sfx, recurse) {
				if (sfx === "px" || !sfx) { return v; }
				if (sfx === "auto" || !v) { return 0; }
				var horiz = _horizExp.test(p),
					node = t,
					style = _tempDiv.style,
					neg = (v < 0),
					pix, cache, time;
				if (neg) {
					v = -v;
				}
				if (sfx === "%" && p.indexOf("border") !== -1) {
					pix = (v / 100) * (horiz ? t.clientWidth : t.clientHeight);
				} else {
					style.cssText = "border:0 solid red;position:" + _getStyle(t, "position") + ";line-height:0;";
					if (sfx === "%" || !node.appendChild || sfx.charAt(0) === "v" || sfx === "rem") {
						node = t.parentNode || _doc.body;
						cache = node._gsCache;
						time = TweenLite.ticker.frame;
						if (cache && horiz && cache.time === time) { //performance optimization: we record the width of elements along with the ticker frame so that we can quickly get it again on the same tick (seems relatively safe to assume it wouldn't change on the same tick)
							return cache.width * v / 100;
						}
						style[(horiz ? "width" : "height")] = v + sfx;
					} else {
						style[(horiz ? "borderLeftWidth" : "borderTopWidth")] = v + sfx;
					}
					node.appendChild(_tempDiv);
					pix = parseFloat(_tempDiv[(horiz ? "offsetWidth" : "offsetHeight")]);
					node.removeChild(_tempDiv);
					if (horiz && sfx === "%" && CSSPlugin.cacheWidths !== false) {
						cache = node._gsCache = node._gsCache || {};
						cache.time = time;
						cache.width = pix / v * 100;
					}
					if (pix === 0 && !recurse) {
						pix = _convertToPixels(t, p, v, sfx, true);
					}
				}
				return neg ? -pix : pix;
			},
			_calculateOffset = _internals.calculateOffset = function(t, p, cs) { //for figuring out "top" or "left" in px when it's "auto". We need to factor in margin with the offsetLeft/offsetTop
				if (_getStyle(t, "position", cs) !== "absolute") { return 0; }
				var dim = ((p === "left") ? "Left" : "Top"),
					v = _getStyle(t, "margin" + dim, cs);
				return t["offset" + dim] - (_convertToPixels(t, p, parseFloat(v), v.replace(_suffixExp, "")) || 0);
			},

			// @private returns at object containing ALL of the style properties in camelCase and their associated values.
			_getAllStyles = function(t, cs) {
				var s = {},
					i, tr, p;
				if ((cs = cs || _getComputedStyle(t, null))) {
					if ((i = cs.length)) {
						while (--i > -1) {
							p = cs[i];
							if (p.indexOf("-transform") === -1 || _transformPropCSS === p) { //Some webkit browsers duplicate transform values, one non-prefixed and one prefixed ("transform" and "WebkitTransform"), so we must weed out the extra one here.
								s[p.replace(_camelExp, _camelFunc)] = cs.getPropertyValue(p);
							}
						}
					} else { //some browsers behave differently - cs.length is always 0, so we must do a for...in loop.
						for (i in cs) {
							if (i.indexOf("Transform") === -1 || _transformProp === i) { //Some webkit browsers duplicate transform values, one non-prefixed and one prefixed ("transform" and "WebkitTransform"), so we must weed out the extra one here.
								s[i] = cs[i];
							}
						}
					}
				} else if ((cs = t.currentStyle || t.style)) {
					for (i in cs) {
						if (typeof(i) === "string" && s[i] === undefined) {
							s[i.replace(_camelExp, _camelFunc)] = cs[i];
						}
					}
				}
				if (!_supportsOpacity) {
					s.opacity = _getIEOpacity(t);
				}
				tr = _getTransform(t, cs, false);
				s.rotation = tr.rotation;
				s.skewX = tr.skewX;
				s.scaleX = tr.scaleX;
				s.scaleY = tr.scaleY;
				s.x = tr.x;
				s.y = tr.y;
				if (_supports3D) {
					s.z = tr.z;
					s.rotationX = tr.rotationX;
					s.rotationY = tr.rotationY;
					s.scaleZ = tr.scaleZ;
				}
				if (s.filters) {
					delete s.filters;
				}
				return s;
			},

			// @private analyzes two style objects (as returned by _getAllStyles()) and only looks for differences between them that contain tweenable values (like a number or color). It returns an object with a "difs" property which refers to an object containing only those isolated properties and values for tweening, and a "firstMPT" property which refers to the first MiniPropTween instance in a linked list that recorded all the starting values of the different properties so that we can revert to them at the end or beginning of the tween - we don't want the cascading to get messed up. The forceLookup parameter is an optional generic object with properties that should be forced into the results - this is necessary for className tweens that are overwriting others because imagine a scenario where a rollover/rollout adds/removes a class and the user swipes the mouse over the target SUPER fast, thus nothing actually changed yet and the subsequent comparison of the properties would indicate they match (especially when px rounding is taken into consideration), thus no tweening is necessary even though it SHOULD tween and remove those properties after the tween (otherwise the inline styles will contaminate things). See the className SpecialProp code for details.
			_cssDif = function(t, s1, s2, vars, forceLookup) {
				var difs = {},
					style = t.style,
					val, p, mpt;
				for (p in s2) {
					if (p !== "cssText") if (p !== "length") if (isNaN(p)) if (s1[p] !== (val = s2[p]) || (forceLookup && forceLookup[p])) if (p.indexOf("Origin") === -1) if (typeof(val) === "number" || typeof(val) === "string") {
						difs[p] = (val === "auto" && (p === "left" || p === "top")) ? _calculateOffset(t, p) : ((val === "" || val === "auto" || val === "none") && typeof(s1[p]) === "string" && s1[p].replace(_NaNExp, "") !== "") ? 0 : val; //if the ending value is defaulting ("" or "auto"), we check the starting value and if it can be parsed into a number (a string which could have a suffix too, like 700px), then we swap in 0 for "" or "auto" so that things actually tween.
						if (style[p] !== undefined) { //for className tweens, we must remember which properties already existed inline - the ones that didn't should be removed when the tween isn't in progress because they were only introduced to facilitate the transition between classes.
							mpt = new MiniPropTween(style, p, style[p], mpt);
						}
					}
				}
				if (vars) {
					for (p in vars) { //copy properties (except className)
						if (p !== "className") {
							difs[p] = vars[p];
						}
					}
				}
				return {difs:difs, firstMPT:mpt};
			},
			_dimensions = {width:["Left","Right"], height:["Top","Bottom"]},
			_margins = ["marginLeft","marginRight","marginTop","marginBottom"],

			/**
			 * @private Gets the width or height of an element
			 * @param {!Object} t Target element
			 * @param {!string} p Property name ("width" or "height")
			 * @param {Object=} cs Computed style object (if one exists). Just a speed optimization.
			 * @return {number} Dimension (in pixels)
			 */
			_getDimension = function(t, p, cs) {
				var v = parseFloat((p === "width") ? t.offsetWidth : t.offsetHeight),
					a = _dimensions[p],
					i = a.length;
				cs = cs || _getComputedStyle(t, null);
				while (--i > -1) {
					v -= parseFloat( _getStyle(t, "padding" + a[i], cs, true) ) || 0;
					v -= parseFloat( _getStyle(t, "border" + a[i] + "Width", cs, true) ) || 0;
				}
				return v;
			},

			// @private Parses position-related complex strings like "top left" or "50px 10px" or "70% 20%", etc. which are used for things like transformOrigin or backgroundPosition. Optionally decorates a supplied object (recObj) with the following properties: "ox" (offsetX), "oy" (offsetY), "oxp" (if true, "ox" is a percentage not a pixel value), and "oxy" (if true, "oy" is a percentage not a pixel value)
			_parsePosition = function(v, recObj) {
				if (v === "contain" || v === "auto" || v === "auto auto") {
					return v + " ";
				}
				if (v == null || v === "") { //note: Firefox uses "auto auto" as default whereas Chrome uses "auto".
					v = "0 0";
				}
				var a = v.split(" "),
					x = (v.indexOf("left") !== -1) ? "0%" : (v.indexOf("right") !== -1) ? "100%" : a[0],
					y = (v.indexOf("top") !== -1) ? "0%" : (v.indexOf("bottom") !== -1) ? "100%" : a[1];
				if (y == null) {
					y = (x === "center") ? "50%" : "0";
				} else if (y === "center") {
					y = "50%";
				}
				if (x === "center" || (isNaN(parseFloat(x)) && (x + "").indexOf("=") === -1)) { //remember, the user could flip-flop the values and say "bottom center" or "center bottom", etc. "center" is ambiguous because it could be used to describe horizontal or vertical, hence the isNaN(). If there's an "=" sign in the value, it's relative.
					x = "50%";
				}
				v = x + " " + y + ((a.length > 2) ? " " + a[2] : "");
				if (recObj) {
					recObj.oxp = (x.indexOf("%") !== -1);
					recObj.oyp = (y.indexOf("%") !== -1);
					recObj.oxr = (x.charAt(1) === "=");
					recObj.oyr = (y.charAt(1) === "=");
					recObj.ox = parseFloat(x.replace(_NaNExp, ""));
					recObj.oy = parseFloat(y.replace(_NaNExp, ""));
					recObj.v = v;
				}
				return recObj || v;
			},

			/**
			 * @private Takes an ending value (typically a string, but can be a number) and a starting value and returns the change between the two, looking for relative value indicators like += and -= and it also ignores suffixes (but make sure the ending value starts with a number or +=/-= and that the starting value is a NUMBER!)
			 * @param {(number|string)} e End value which is typically a string, but could be a number
			 * @param {(number|string)} b Beginning value which is typically a string but could be a number
			 * @return {number} Amount of change between the beginning and ending values (relative values that have a "+=" or "-=" are recognized)
			 */
			_parseChange = function(e, b) {
				return (typeof(e) === "string" && e.charAt(1) === "=") ? parseInt(e.charAt(0) + "1", 10) * parseFloat(e.substr(2)) : parseFloat(e) - parseFloat(b);
			},

			/**
			 * @private Takes a value and a default number, checks if the value is relative, null, or numeric and spits back a normalized number accordingly. Primarily used in the _parseTransform() function.
			 * @param {Object} v Value to be parsed
			 * @param {!number} d Default value (which is also used for relative calculations if "+=" or "-=" is found in the first parameter)
			 * @return {number} Parsed value
			 */
			_parseVal = function(v, d) {
				return (v == null) ? d : (typeof(v) === "string" && v.charAt(1) === "=") ? parseInt(v.charAt(0) + "1", 10) * parseFloat(v.substr(2)) + d : parseFloat(v);
			},

			/**
			 * @private Translates strings like "40deg" or "40" or 40rad" or "+=40deg" or "270_short" or "-90_cw" or "+=45_ccw" to a numeric radian angle. Of course a starting/default value must be fed in too so that relative values can be calculated properly.
			 * @param {Object} v Value to be parsed
			 * @param {!number} d Default value (which is also used for relative calculations if "+=" or "-=" is found in the first parameter)
			 * @param {string=} p property name for directionalEnd (optional - only used when the parsed value is directional ("_short", "_cw", or "_ccw" suffix). We need a way to store the uncompensated value so that at the end of the tween, we set it to exactly what was requested with no directional compensation). Property name would be "rotation", "rotationX", or "rotationY"
			 * @param {Object=} directionalEnd An object that will store the raw end values for directional angles ("_short", "_cw", or "_ccw" suffix). We need a way to store the uncompensated value so that at the end of the tween, we set it to exactly what was requested with no directional compensation.
			 * @return {number} parsed angle in radians
			 */
			_parseAngle = function(v, d, p, directionalEnd) {
				var min = 0.000001,
					cap, split, dif, result, isRelative;
				if (v == null) {
					result = d;
				} else if (typeof(v) === "number") {
					result = v;
				} else {
					cap = 360;
					split = v.split("_");
					isRelative = (v.charAt(1) === "=");
					dif = (isRelative ? parseInt(v.charAt(0) + "1", 10) * parseFloat(split[0].substr(2)) : parseFloat(split[0])) * ((v.indexOf("rad") === -1) ? 1 : _RAD2DEG) - (isRelative ? 0 : d);
					if (split.length) {
						if (directionalEnd) {
							directionalEnd[p] = d + dif;
						}
						if (v.indexOf("short") !== -1) {
							dif = dif % cap;
							if (dif !== dif % (cap / 2)) {
								dif = (dif < 0) ? dif + cap : dif - cap;
							}
						}
						if (v.indexOf("_cw") !== -1 && dif < 0) {
							dif = ((dif + cap * 9999999999) % cap) - ((dif / cap) | 0) * cap;
						} else if (v.indexOf("ccw") !== -1 && dif > 0) {
							dif = ((dif - cap * 9999999999) % cap) - ((dif / cap) | 0) * cap;
						}
					}
					result = d + dif;
				}
				if (result < min && result > -min) {
					result = 0;
				}
				return result;
			},

			_colorLookup = {aqua:[0,255,255],
				lime:[0,255,0],
				silver:[192,192,192],
				black:[0,0,0],
				maroon:[128,0,0],
				teal:[0,128,128],
				blue:[0,0,255],
				navy:[0,0,128],
				white:[255,255,255],
				fuchsia:[255,0,255],
				olive:[128,128,0],
				yellow:[255,255,0],
				orange:[255,165,0],
				gray:[128,128,128],
				purple:[128,0,128],
				green:[0,128,0],
				red:[255,0,0],
				pink:[255,192,203],
				cyan:[0,255,255],
				transparent:[255,255,255,0]},

			_hue = function(h, m1, m2) {
				h = (h < 0) ? h + 1 : (h > 1) ? h - 1 : h;
				return ((((h * 6 < 1) ? m1 + (m2 - m1) * h * 6 : (h < 0.5) ? m2 : (h * 3 < 2) ? m1 + (m2 - m1) * (2 / 3 - h) * 6 : m1) * 255) + 0.5) | 0;
			},

			/**
			 * @private Parses a color (like #9F0, #FF9900, rgb(255,51,153) or hsl(108, 50%, 10%)) into an array with 3 elements for red, green, and blue or if toHSL parameter is true, it will populate the array with hue, saturation, and lightness values. If a relative value is found in an hsl() or hsla() string, it will preserve those relative prefixes and all the values in the array will be strings instead of numbers (in all other cases it will be populated with numbers).
			 * @param {(string|number)} v The value the should be parsed which could be a string like #9F0 or rgb(255,102,51) or rgba(255,0,0,0.5) or it could be a number like 0xFF00CC or even a named color like red, blue, purple, etc.
			 * @param {(boolean)} toHSL If true, an hsl() or hsla() value will be returned instead of rgb() or rgba()
			 * @return {Array.<number>} An array containing red, green, and blue (and optionally alpha) in that order, or if the toHSL parameter was true, the array will contain hue, saturation and lightness (and optionally alpha) in that order. Always numbers unless there's a relative prefix found in an hsl() or hsla() string and toHSL is true.
			 */
			_parseColor = CSSPlugin.parseColor = function(v, toHSL) {
				var a, r, g, b, h, s, l, max, min, d, wasHSL;
				if (!v) {
					a = _colorLookup.black;
				} else if (typeof(v) === "number") {
					a = [v >> 16, (v >> 8) & 255, v & 255];
				} else {
					if (v.charAt(v.length - 1) === ",") { //sometimes a trailing comma is included and we should chop it off (typically from a comma-delimited list of values like a textShadow:"2px 2px 2px blue, 5px 5px 5px rgb(255,0,0)" - in this example "blue," has a trailing comma. We could strip it out inside parseComplex() but we'd need to do it to the beginning and ending values plus it wouldn't provide protection from other potential scenarios like if the user passes in a similar value.
						v = v.substr(0, v.length - 1);
					}
					if (_colorLookup[v]) {
						a = _colorLookup[v];
					} else if (v.charAt(0) === "#") {
						if (v.length === 4) { //for shorthand like #9F0
							r = v.charAt(1);
							g = v.charAt(2);
							b = v.charAt(3);
							v = "#" + r + r + g + g + b + b;
						}
						v = parseInt(v.substr(1), 16);
						a = [v >> 16, (v >> 8) & 255, v & 255];
					} else if (v.substr(0, 3) === "hsl") {
						a = wasHSL = v.match(_numExp);
						if (!toHSL) {
							h = (Number(a[0]) % 360) / 360;
							s = Number(a[1]) / 100;
							l = Number(a[2]) / 100;
							g = (l <= 0.5) ? l * (s + 1) : l + s - l * s;
							r = l * 2 - g;
							if (a.length > 3) {
								a[3] = Number(v[3]);
							}
							a[0] = _hue(h + 1 / 3, r, g);
							a[1] = _hue(h, r, g);
							a[2] = _hue(h - 1 / 3, r, g);
						} else if (v.indexOf("=") !== -1) { //if relative values are found, just return the raw strings with the relative prefixes in place.
							return v.match(_relNumExp);
						}
					} else {
						a = v.match(_numExp) || _colorLookup.transparent;
					}
					a[0] = Number(a[0]);
					a[1] = Number(a[1]);
					a[2] = Number(a[2]);
					if (a.length > 3) {
						a[3] = Number(a[3]);
					}
				}
				if (toHSL && !wasHSL) {
					r = a[0] / 255;
					g = a[1] / 255;
					b = a[2] / 255;
					max = Math.max(r, g, b);
					min = Math.min(r, g, b);
					l = (max + min) / 2;
					if (max === min) {
						h = s = 0;
					} else {
						d = max - min;
						s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
						h = (max === r) ? (g - b) / d + (g < b ? 6 : 0) : (max === g) ? (b - r) / d + 2 : (r - g) / d + 4;
						h *= 60;
					}
					a[0] = (h + 0.5) | 0;
					a[1] = (s * 100 + 0.5) | 0;
					a[2] = (l * 100 + 0.5) | 0;
				}
				return a;
			},
			_formatColors = function(s, toHSL) {
				var colors = s.match(_colorExp) || [],
					charIndex = 0,
					parsed = colors.length ? "" : s,
					i, color, temp;
				for (i = 0; i < colors.length; i++) {
					color = colors[i];
					temp = s.substr(charIndex, s.indexOf(color, charIndex)-charIndex);
					charIndex += temp.length + color.length;
					color = _parseColor(color, toHSL);
					if (color.length === 3) {
						color.push(1);
					}
					parsed += temp + (toHSL ? "hsla(" + color[0] + "," + color[1] + "%," + color[2] + "%," + color[3] : "rgba(" + color.join(",")) + ")";
				}
				return parsed;
			},
			_colorExp = "(?:\\b(?:(?:rgb|rgba|hsl|hsla)\\(.+?\\))|\\B#.+?\\b"; //we'll dynamically build this Regular Expression to conserve file size. After building it, it will be able to find rgb(), rgba(), # (hexadecimal), and named color values like red, blue, purple, etc.

		for (p in _colorLookup) {
			_colorExp += "|" + p + "\\b";
		}
		_colorExp = new RegExp(_colorExp+")", "gi");

		CSSPlugin.colorStringFilter = function(a) {
			var combined = a[0] + a[1],
				toHSL;
			_colorExp.lastIndex = 0;
			if (_colorExp.test(combined)) {
				toHSL = (combined.indexOf("hsl(") !== -1 || combined.indexOf("hsla(") !== -1);
				a[0] = _formatColors(a[0], toHSL);
				a[1] = _formatColors(a[1], toHSL);
			}
		};

		if (!TweenLite.defaultStringFilter) {
			TweenLite.defaultStringFilter = CSSPlugin.colorStringFilter;
		}

		/**
		 * @private Returns a formatter function that handles taking a string (or number in some cases) and returning a consistently formatted one in terms of delimiters, quantity of values, etc. For example, we may get boxShadow values defined as "0px red" or "0px 0px 10px rgb(255,0,0)" or "0px 0px 20px 20px #F00" and we need to ensure that what we get back is described with 4 numbers and a color. This allows us to feed it into the _parseComplex() method and split the values up appropriately. The neat thing about this _getFormatter() function is that the dflt defines a pattern as well as a default, so for example, _getFormatter("0px 0px 0px 0px #777", true) not only sets the default as 0px for all distances and #777 for the color, but also sets the pattern such that 4 numbers and a color will always get returned.
		 * @param {!string} dflt The default value and pattern to follow. So "0px 0px 0px 0px #777" will ensure that 4 numbers and a color will always get returned.
		 * @param {boolean=} clr If true, the values should be searched for color-related data. For example, boxShadow values typically contain a color whereas borderRadius don't.
		 * @param {boolean=} collapsible If true, the value is a top/left/right/bottom style one that acts like margin or padding, where if only one value is received, it's used for all 4; if 2 are received, the first is duplicated for 3rd (bottom) and the 2nd is duplicated for the 4th spot (left), etc.
		 * @return {Function} formatter function
		 */
		var _getFormatter = function(dflt, clr, collapsible, multi) {
				if (dflt == null) {
					return function(v) {return v;};
				}
				var dColor = clr ? (dflt.match(_colorExp) || [""])[0] : "",
					dVals = dflt.split(dColor).join("").match(_valuesExp) || [],
					pfx = dflt.substr(0, dflt.indexOf(dVals[0])),
					sfx = (dflt.charAt(dflt.length - 1) === ")") ? ")" : "",
					delim = (dflt.indexOf(" ") !== -1) ? " " : ",",
					numVals = dVals.length,
					dSfx = (numVals > 0) ? dVals[0].replace(_numExp, "") : "",
					formatter;
				if (!numVals) {
					return function(v) {return v;};
				}
				if (clr) {
					formatter = function(v) {
						var color, vals, i, a;
						if (typeof(v) === "number") {
							v += dSfx;
						} else if (multi && _commasOutsideParenExp.test(v)) {
							a = v.replace(_commasOutsideParenExp, "|").split("|");
							for (i = 0; i < a.length; i++) {
								a[i] = formatter(a[i]);
							}
							return a.join(",");
						}
						color = (v.match(_colorExp) || [dColor])[0];
						vals = v.split(color).join("").match(_valuesExp) || [];
						i = vals.length;
						if (numVals > i--) {
							while (++i < numVals) {
								vals[i] = collapsible ? vals[(((i - 1) / 2) | 0)] : dVals[i];
							}
						}
						return pfx + vals.join(delim) + delim + color + sfx + (v.indexOf("inset") !== -1 ? " inset" : "");
					};
					return formatter;

				}
				formatter = function(v) {
					var vals, a, i;
					if (typeof(v) === "number") {
						v += dSfx;
					} else if (multi && _commasOutsideParenExp.test(v)) {
						a = v.replace(_commasOutsideParenExp, "|").split("|");
						for (i = 0; i < a.length; i++) {
							a[i] = formatter(a[i]);
						}
						return a.join(",");
					}
					vals = v.match(_valuesExp) || [];
					i = vals.length;
					if (numVals > i--) {
						while (++i < numVals) {
							vals[i] = collapsible ? vals[(((i - 1) / 2) | 0)] : dVals[i];
						}
					}
					return pfx + vals.join(delim) + sfx;
				};
				return formatter;
			},

			/**
			 * @private returns a formatter function that's used for edge-related values like marginTop, marginLeft, paddingBottom, paddingRight, etc. Just pass a comma-delimited list of property names related to the edges.
			 * @param {!string} props a comma-delimited list of property names in order from top to left, like "marginTop,marginRight,marginBottom,marginLeft"
			 * @return {Function} a formatter function
			 */
			_getEdgeParser = function(props) {
				props = props.split(",");
				return function(t, e, p, cssp, pt, plugin, vars) {
					var a = (e + "").split(" "),
						i;
					vars = {};
					for (i = 0; i < 4; i++) {
						vars[props[i]] = a[i] = a[i] || a[(((i - 1) / 2) >> 0)];
					}
					return cssp.parse(t, vars, pt, plugin);
				};
			},

			// @private used when other plugins must tween values first, like BezierPlugin or ThrowPropsPlugin, etc. That plugin's setRatio() gets called first so that the values are updated, and then we loop through the MiniPropTweens  which handle copying the values into their appropriate slots so that they can then be applied correctly in the main CSSPlugin setRatio() method. Remember, we typically create a proxy object that has a bunch of uniquely-named properties that we feed to the sub-plugin and it does its magic normally, and then we must interpret those values and apply them to the css because often numbers must get combined/concatenated, suffixes added, etc. to work with css, like boxShadow could have 4 values plus a color.
			_setPluginRatio = _internals._setPluginRatio = function(v) {
				this.plugin.setRatio(v);
				var d = this.data,
					proxy = d.proxy,
					mpt = d.firstMPT,
					min = 0.000001,
					val, pt, i, str;
				while (mpt) {
					val = proxy[mpt.v];
					if (mpt.r) {
						val = Math.round(val);
					} else if (val < min && val > -min) {
						val = 0;
					}
					mpt.t[mpt.p] = val;
					mpt = mpt._next;
				}
				if (d.autoRotate) {
					d.autoRotate.rotation = proxy.rotation;
				}
				//at the end, we must set the CSSPropTween's "e" (end) value dynamically here because that's what is used in the final setRatio() method.
				if (v === 1) {
					mpt = d.firstMPT;
					while (mpt) {
						pt = mpt.t;
						if (!pt.type) {
							pt.e = pt.s + pt.xs0;
						} else if (pt.type === 1) {
							str = pt.xs0 + pt.s + pt.xs1;
							for (i = 1; i < pt.l; i++) {
								str += pt["xn"+i] + pt["xs"+(i+1)];
							}
							pt.e = str;
						}
						mpt = mpt._next;
					}
				}
			},

			/**
			 * @private @constructor Used by a few SpecialProps to hold important values for proxies. For example, _parseToProxy() creates a MiniPropTween instance for each property that must get tweened on the proxy, and we record the original property name as well as the unique one we create for the proxy, plus whether or not the value needs to be rounded plus the original value.
			 * @param {!Object} t target object whose property we're tweening (often a CSSPropTween)
			 * @param {!string} p property name
			 * @param {(number|string|object)} v value
			 * @param {MiniPropTween=} next next MiniPropTween in the linked list
			 * @param {boolean=} r if true, the tweened value should be rounded to the nearest integer
			 */
			MiniPropTween = function(t, p, v, next, r) {
				this.t = t;
				this.p = p;
				this.v = v;
				this.r = r;
				if (next) {
					next._prev = this;
					this._next = next;
				}
			},

			/**
			 * @private Most other plugins (like BezierPlugin and ThrowPropsPlugin and others) can only tween numeric values, but CSSPlugin must accommodate special values that have a bunch of extra data (like a suffix or strings between numeric values, etc.). For example, boxShadow has values like "10px 10px 20px 30px rgb(255,0,0)" which would utterly confuse other plugins. This method allows us to split that data apart and grab only the numeric data and attach it to uniquely-named properties of a generic proxy object ({}) so that we can feed that to virtually any plugin to have the numbers tweened. However, we must also keep track of which properties from the proxy go with which CSSPropTween values and instances. So we create a linked list of MiniPropTweens. Each one records a target (the original CSSPropTween), property (like "s" or "xn1" or "xn2") that we're tweening and the unique property name that was used for the proxy (like "boxShadow_xn1" and "boxShadow_xn2") and whether or not they need to be rounded. That way, in the _setPluginRatio() method we can simply copy the values over from the proxy to the CSSPropTween instance(s). Then, when the main CSSPlugin setRatio() method runs and applies the CSSPropTween values accordingly, they're updated nicely. So the external plugin tweens the numbers, _setPluginRatio() copies them over, and setRatio() acts normally, applying css-specific values to the element.
			 * This method returns an object that has the following properties:
			 *  - proxy: a generic object containing the starting values for all the properties that will be tweened by the external plugin.  This is what we feed to the external _onInitTween() as the target
			 *  - end: a generic object containing the ending values for all the properties that will be tweened by the external plugin. This is what we feed to the external plugin's _onInitTween() as the destination values
			 *  - firstMPT: the first MiniPropTween in the linked list
			 *  - pt: the first CSSPropTween in the linked list that was created when parsing. If shallow is true, this linked list will NOT attach to the one passed into the _parseToProxy() as the "pt" (4th) parameter.
			 * @param {!Object} t target object to be tweened
			 * @param {!(Object|string)} vars the object containing the information about the tweening values (typically the end/destination values) that should be parsed
			 * @param {!CSSPlugin} cssp The CSSPlugin instance
			 * @param {CSSPropTween=} pt the next CSSPropTween in the linked list
			 * @param {TweenPlugin=} plugin the external TweenPlugin instance that will be handling tweening the numeric values
			 * @param {boolean=} shallow if true, the resulting linked list from the parse will NOT be attached to the CSSPropTween that was passed in as the "pt" (4th) parameter.
			 * @return An object containing the following properties: proxy, end, firstMPT, and pt (see above for descriptions)
			 */
			_parseToProxy = _internals._parseToProxy = function(t, vars, cssp, pt, plugin, shallow) {
				var bpt = pt,
					start = {},
					end = {},
					transform = cssp._transform,
					oldForce = _forcePT,
					i, p, xp, mpt, firstPT;
				cssp._transform = null;
				_forcePT = vars;
				pt = firstPT = cssp.parse(t, vars, pt, plugin);
				_forcePT = oldForce;
				//break off from the linked list so the new ones are isolated.
				if (shallow) {
					cssp._transform = transform;
					if (bpt) {
						bpt._prev = null;
						if (bpt._prev) {
							bpt._prev._next = null;
						}
					}
				}
				while (pt && pt !== bpt) {
					if (pt.type <= 1) {
						p = pt.p;
						end[p] = pt.s + pt.c;
						start[p] = pt.s;
						if (!shallow) {
							mpt = new MiniPropTween(pt, "s", p, mpt, pt.r);
							pt.c = 0;
						}
						if (pt.type === 1) {
							i = pt.l;
							while (--i > 0) {
								xp = "xn" + i;
								p = pt.p + "_" + xp;
								end[p] = pt.data[xp];
								start[p] = pt[xp];
								if (!shallow) {
									mpt = new MiniPropTween(pt, xp, p, mpt, pt.rxp[xp]);
								}
							}
						}
					}
					pt = pt._next;
				}
				return {proxy:start, end:end, firstMPT:mpt, pt:firstPT};
			},



			/**
			 * @constructor Each property that is tweened has at least one CSSPropTween associated with it. These instances store important information like the target, property, starting value, amount of change, etc. They can also optionally have a number of "extra" strings and numeric values named xs1, xn1, xs2, xn2, xs3, xn3, etc. where "s" indicates string and "n" indicates number. These can be pieced together in a complex-value tween (type:1) that has alternating types of data like a string, number, string, number, etc. For example, boxShadow could be "5px 5px 8px rgb(102, 102, 51)". In that value, there are 6 numbers that may need to tween and then pieced back together into a string again with spaces, suffixes, etc. xs0 is special in that it stores the suffix for standard (type:0) tweens, -OR- the first string (prefix) in a complex-value (type:1) CSSPropTween -OR- it can be the non-tweening value in a type:-1 CSSPropTween. We do this to conserve memory.
			 * CSSPropTweens have the following optional properties as well (not defined through the constructor):
			 *  - l: Length in terms of the number of extra properties that the CSSPropTween has (default: 0). For example, for a boxShadow we may need to tween 5 numbers in which case l would be 5; Keep in mind that the start/end values for the first number that's tweened are always stored in the s and c properties to conserve memory. All additional values thereafter are stored in xn1, xn2, etc.
			 *  - xfirst: The first instance of any sub-CSSPropTweens that are tweening properties of this instance. For example, we may split up a boxShadow tween so that there's a main CSSPropTween of type:1 that has various xs* and xn* values associated with the h-shadow, v-shadow, blur, color, etc. Then we spawn a CSSPropTween for each of those that has a higher priority and runs BEFORE the main CSSPropTween so that the values are all set by the time it needs to re-assemble them. The xfirst gives us an easy way to identify the first one in that chain which typically ends at the main one (because they're all prepende to the linked list)
			 *  - plugin: The TweenPlugin instance that will handle the tweening of any complex values. For example, sometimes we don't want to use normal subtweens (like xfirst refers to) to tween the values - we might want ThrowPropsPlugin or BezierPlugin some other plugin to do the actual tweening, so we create a plugin instance and store a reference here. We need this reference so that if we get a request to round values or disable a tween, we can pass along that request.
			 *  - data: Arbitrary data that needs to be stored with the CSSPropTween. Typically if we're going to have a plugin handle the tweening of a complex-value tween, we create a generic object that stores the END values that we're tweening to and the CSSPropTween's xs1, xs2, etc. have the starting values. We store that object as data. That way, we can simply pass that object to the plugin and use the CSSPropTween as the target.
			 *  - setRatio: Only used for type:2 tweens that require custom functionality. In this case, we call the CSSPropTween's setRatio() method and pass the ratio each time the tween updates. This isn't quite as efficient as doing things directly in the CSSPlugin's setRatio() method, but it's very convenient and flexible.
			 * @param {!Object} t Target object whose property will be tweened. Often a DOM element, but not always. It could be anything.
			 * @param {string} p Property to tween (name). For example, to tween element.width, p would be "width".
			 * @param {number} s Starting numeric value
			 * @param {number} c Change in numeric value over the course of the entire tween. For example, if element.width starts at 5 and should end at 100, c would be 95.
			 * @param {CSSPropTween=} next The next CSSPropTween in the linked list. If one is defined, we will define its _prev as the new instance, and the new instance's _next will be pointed at it.
			 * @param {number=} type The type of CSSPropTween where -1 = a non-tweening value, 0 = a standard simple tween, 1 = a complex value (like one that has multiple numbers in a comma- or space-delimited string like border:"1px solid red"), and 2 = one that uses a custom setRatio function that does all of the work of applying the values on each update.
			 * @param {string=} n Name of the property that should be used for overwriting purposes which is typically the same as p but not always. For example, we may need to create a subtween for the 2nd part of a "clip:rect(...)" tween in which case "p" might be xs1 but "n" is still "clip"
			 * @param {boolean=} r If true, the value(s) should be rounded
			 * @param {number=} pr Priority in the linked list order. Higher priority CSSPropTweens will be updated before lower priority ones. The default priority is 0.
			 * @param {string=} b Beginning value. We store this to ensure that it is EXACTLY what it was when the tween began without any risk of interpretation issues.
			 * @param {string=} e Ending value. We store this to ensure that it is EXACTLY what the user defined at the end of the tween without any risk of interpretation issues.
			 */
			CSSPropTween = _internals.CSSPropTween = function(t, p, s, c, next, type, n, r, pr, b, e) {
				this.t = t; //target
				this.p = p; //property
				this.s = s; //starting value
				this.c = c; //change value
				this.n = n || p; //name that this CSSPropTween should be associated to (usually the same as p, but not always - n is what overwriting looks at)
				if (!(t instanceof CSSPropTween)) {
					_overwriteProps.push(this.n);
				}
				this.r = r; //round (boolean)
				this.type = type || 0; //0 = normal tween, -1 = non-tweening (in which case xs0 will be applied to the target's property, like tp.t[tp.p] = tp.xs0), 1 = complex-value SpecialProp, 2 = custom setRatio() that does all the work
				if (pr) {
					this.pr = pr;
					_hasPriority = true;
				}
				this.b = (b === undefined) ? s : b;
				this.e = (e === undefined) ? s + c : e;
				if (next) {
					this._next = next;
					next._prev = this;
				}
			},

			_addNonTweeningNumericPT = function(target, prop, start, end, next, overwriteProp) { //cleans up some code redundancies and helps minification. Just a fast way to add a NUMERIC non-tweening CSSPropTween
				var pt = new CSSPropTween(target, prop, start, end - start, next, -1, overwriteProp);
				pt.b = start;
				pt.e = pt.xs0 = end;
				return pt;
			},

			/**
			 * Takes a target, the beginning value and ending value (as strings) and parses them into a CSSPropTween (possibly with child CSSPropTweens) that accommodates multiple numbers, colors, comma-delimited values, etc. For example:
			 * sp.parseComplex(element, "boxShadow", "5px 10px 20px rgb(255,102,51)", "0px 0px 0px red", true, "0px 0px 0px rgb(0,0,0,0)", pt);
			 * It will walk through the beginning and ending values (which should be in the same format with the same number and type of values) and figure out which parts are numbers, what strings separate the numeric/tweenable values, and then create the CSSPropTweens accordingly. If a plugin is defined, no child CSSPropTweens will be created. Instead, the ending values will be stored in the "data" property of the returned CSSPropTween like: {s:-5, xn1:-10, xn2:-20, xn3:255, xn4:0, xn5:0} so that it can be fed to any other plugin and it'll be plain numeric tweens but the recomposition of the complex value will be handled inside CSSPlugin's setRatio().
			 * If a setRatio is defined, the type of the CSSPropTween will be set to 2 and recomposition of the values will be the responsibility of that method.
			 *
			 * @param {!Object} t Target whose property will be tweened
			 * @param {!string} p Property that will be tweened (its name, like "left" or "backgroundColor" or "boxShadow")
			 * @param {string} b Beginning value
			 * @param {string} e Ending value
			 * @param {boolean} clrs If true, the value could contain a color value like "rgb(255,0,0)" or "#F00" or "red". The default is false, so no colors will be recognized (a performance optimization)
			 * @param {(string|number|Object)} dflt The default beginning value that should be used if no valid beginning value is defined or if the number of values inside the complex beginning and ending values don't match
			 * @param {?CSSPropTween} pt CSSPropTween instance that is the current head of the linked list (we'll prepend to this).
			 * @param {number=} pr Priority in the linked list order. Higher priority properties will be updated before lower priority ones. The default priority is 0.
			 * @param {TweenPlugin=} plugin If a plugin should handle the tweening of extra properties, pass the plugin instance here. If one is defined, then NO subtweens will be created for any extra properties (the properties will be created - just not additional CSSPropTween instances to tween them) because the plugin is expected to do so. However, the end values WILL be populated in the "data" property, like {s:100, xn1:50, xn2:300}
			 * @param {function(number)=} setRatio If values should be set in a custom function instead of being pieced together in a type:1 (complex-value) CSSPropTween, define that custom function here.
			 * @return {CSSPropTween} The first CSSPropTween in the linked list which includes the new one(s) added by the parseComplex() call.
			 */
			_parseComplex = CSSPlugin.parseComplex = function(t, p, b, e, clrs, dflt, pt, pr, plugin, setRatio) {
				//DEBUG: _log("parseComplex: "+p+", b: "+b+", e: "+e);
				b = b || dflt || "";
				pt = new CSSPropTween(t, p, 0, 0, pt, (setRatio ? 2 : 1), null, false, pr, b, e);
				e += ""; //ensures it's a string
				var ba = b.split(", ").join(",").split(" "), //beginning array
					ea = e.split(", ").join(",").split(" "), //ending array
					l = ba.length,
					autoRound = (_autoRound !== false),
					i, xi, ni, bv, ev, bnums, enums, bn, hasAlpha, temp, cv, str, useHSL;
				if (e.indexOf(",") !== -1 || b.indexOf(",") !== -1) {
					ba = ba.join(" ").replace(_commasOutsideParenExp, ", ").split(" ");
					ea = ea.join(" ").replace(_commasOutsideParenExp, ", ").split(" ");
					l = ba.length;
				}
				if (l !== ea.length) {
					//DEBUG: _log("mismatched formatting detected on " + p + " (" + b + " vs " + e + ")");
					ba = (dflt || "").split(" ");
					l = ba.length;
				}
				pt.plugin = plugin;
				pt.setRatio = setRatio;
				_colorExp.lastIndex = 0;
				for (i = 0; i < l; i++) {
					bv = ba[i];
					ev = ea[i];
					bn = parseFloat(bv);
					//if the value begins with a number (most common). It's fine if it has a suffix like px
					if (bn || bn === 0) {
						pt.appendXtra("", bn, _parseChange(ev, bn), ev.replace(_relNumExp, ""), (autoRound && ev.indexOf("px") !== -1), true);

					//if the value is a color
					} else if (clrs && _colorExp.test(bv)) {
						str = ev.charAt(ev.length - 1) === "," ? ")," : ")"; //if there's a comma at the end, retain it.
						useHSL = (ev.indexOf("hsl") !== -1 && _supportsOpacity);
						bv = _parseColor(bv, useHSL);
						ev = _parseColor(ev, useHSL);
						hasAlpha = (bv.length + ev.length > 6);
						if (hasAlpha && !_supportsOpacity && ev[3] === 0) { //older versions of IE don't support rgba(), so if the destination alpha is 0, just use "transparent" for the end color
							pt["xs" + pt.l] += pt.l ? " transparent" : "transparent";
							pt.e = pt.e.split(ea[i]).join("transparent");
						} else {
							if (!_supportsOpacity) { //old versions of IE don't support rgba().
								hasAlpha = false;
							}
							if (useHSL) {
								pt.appendXtra((hasAlpha ? "hsla(" : "hsl("), bv[0], _parseChange(ev[0], bv[0]), ",", false, true)
									.appendXtra("", bv[1], _parseChange(ev[1], bv[1]), "%,", false)
									.appendXtra("", bv[2], _parseChange(ev[2], bv[2]), (hasAlpha ? "%," : "%" + str), false);
							} else {
								pt.appendXtra((hasAlpha ? "rgba(" : "rgb("), bv[0], ev[0] - bv[0], ",", true, true)
									.appendXtra("", bv[1], ev[1] - bv[1], ",", true)
									.appendXtra("", bv[2], ev[2] - bv[2], (hasAlpha ? "," : str), true);
							}

							if (hasAlpha) {
								bv = (bv.length < 4) ? 1 : bv[3];
								pt.appendXtra("", bv, ((ev.length < 4) ? 1 : ev[3]) - bv, str, false);
							}
						}
						_colorExp.lastIndex = 0; //otherwise the test() on the RegExp could move the lastIndex and taint future results.

					} else {
						bnums = bv.match(_numExp); //gets each group of numbers in the beginning value string and drops them into an array

						//if no number is found, treat it as a non-tweening value and just append the string to the current xs.
						if (!bnums) {
							pt["xs" + pt.l] += pt.l ? " " + bv : bv;

						//loop through all the numbers that are found and construct the extra values on the pt.
						} else {
							enums = ev.match(_relNumExp); //get each group of numbers in the end value string and drop them into an array. We allow relative values too, like +=50 or -=.5
							if (!enums || enums.length !== bnums.length) {
								//DEBUG: _log("mismatched formatting detected on " + p + " (" + b + " vs " + e + ")");
								return pt;
							}
							ni = 0;
							for (xi = 0; xi < bnums.length; xi++) {
								cv = bnums[xi];
								temp = bv.indexOf(cv, ni);
								pt.appendXtra(bv.substr(ni, temp - ni), Number(cv), _parseChange(enums[xi], cv), "", (autoRound && bv.substr(temp + cv.length, 2) === "px"), (xi === 0));
								ni = temp + cv.length;
							}
							pt["xs" + pt.l] += bv.substr(ni);
						}
					}
				}
				//if there are relative values ("+=" or "-=" prefix), we need to adjust the ending value to eliminate the prefixes and combine the values properly.
				if (e.indexOf("=") !== -1) if (pt.data) {
					str = pt.xs0 + pt.data.s;
					for (i = 1; i < pt.l; i++) {
						str += pt["xs" + i] + pt.data["xn" + i];
					}
					pt.e = str + pt["xs" + i];
				}
				if (!pt.l) {
					pt.type = -1;
					pt.xs0 = pt.e;
				}
				return pt.xfirst || pt;
			},
			i = 9;


		p = CSSPropTween.prototype;
		p.l = p.pr = 0; //length (number of extra properties like xn1, xn2, xn3, etc.
		while (--i > 0) {
			p["xn" + i] = 0;
			p["xs" + i] = "";
		}
		p.xs0 = "";
		p._next = p._prev = p.xfirst = p.data = p.plugin = p.setRatio = p.rxp = null;


		/**
		 * Appends and extra tweening value to a CSSPropTween and automatically manages any prefix and suffix strings. The first extra value is stored in the s and c of the main CSSPropTween instance, but thereafter any extras are stored in the xn1, xn2, xn3, etc. The prefixes and suffixes are stored in the xs0, xs1, xs2, etc. properties. For example, if I walk through a clip value like "rect(10px, 5px, 0px, 20px)", the values would be stored like this:
		 * xs0:"rect(", s:10, xs1:"px, ", xn1:5, xs2:"px, ", xn2:0, xs3:"px, ", xn3:20, xn4:"px)"
		 * And they'd all get joined together when the CSSPlugin renders (in the setRatio() method).
		 * @param {string=} pfx Prefix (if any)
		 * @param {!number} s Starting value
		 * @param {!number} c Change in numeric value over the course of the entire tween. For example, if the start is 5 and the end is 100, the change would be 95.
		 * @param {string=} sfx Suffix (if any)
		 * @param {boolean=} r Round (if true).
		 * @param {boolean=} pad If true, this extra value should be separated by the previous one by a space. If there is no previous extra and pad is true, it will automatically drop the space.
		 * @return {CSSPropTween} returns itself so that multiple methods can be chained together.
		 */
		p.appendXtra = function(pfx, s, c, sfx, r, pad) {
			var pt = this,
				l = pt.l;
			pt["xs" + l] += (pad && l) ? " " + pfx : pfx || "";
			if (!c) if (l !== 0 && !pt.plugin) { //typically we'll combine non-changing values right into the xs to optimize performance, but we don't combine them when there's a plugin that will be tweening the values because it may depend on the values being split apart, like for a bezier, if a value doesn't change between the first and second iteration but then it does on the 3rd, we'll run into trouble because there's no xn slot for that value!
				pt["xs" + l] += s + (sfx || "");
				return pt;
			}
			pt.l++;
			pt.type = pt.setRatio ? 2 : 1;
			pt["xs" + pt.l] = sfx || "";
			if (l > 0) {
				pt.data["xn" + l] = s + c;
				pt.rxp["xn" + l] = r; //round extra property (we need to tap into this in the _parseToProxy() method)
				pt["xn" + l] = s;
				if (!pt.plugin) {
					pt.xfirst = new CSSPropTween(pt, "xn" + l, s, c, pt.xfirst || pt, 0, pt.n, r, pt.pr);
					pt.xfirst.xs0 = 0; //just to ensure that the property stays numeric which helps modern browsers speed up processing. Remember, in the setRatio() method, we do pt.t[pt.p] = val + pt.xs0 so if pt.xs0 is "" (the default), it'll cast the end value as a string. When a property is a number sometimes and a string sometimes, it prevents the compiler from locking in the data type, slowing things down slightly.
				}
				return pt;
			}
			pt.data = {s:s + c};
			pt.rxp = {};
			pt.s = s;
			pt.c = c;
			pt.r = r;
			return pt;
		};

		/**
		 * @constructor A SpecialProp is basically a css property that needs to be treated in a non-standard way, like if it may contain a complex value like boxShadow:"5px 10px 15px rgb(255, 102, 51)" or if it is associated with another plugin like ThrowPropsPlugin or BezierPlugin. Every SpecialProp is associated with a particular property name like "boxShadow" or "throwProps" or "bezier" and it will intercept those values in the vars object that's passed to the CSSPlugin and handle them accordingly.
		 * @param {!string} p Property name (like "boxShadow" or "throwProps")
		 * @param {Object=} options An object containing any of the following configuration options:
		 *                      - defaultValue: the default value
		 *                      - parser: A function that should be called when the associated property name is found in the vars. This function should return a CSSPropTween instance and it should ensure that it is properly inserted into the linked list. It will receive 4 paramters: 1) The target, 2) The value defined in the vars, 3) The CSSPlugin instance (whose _firstPT should be used for the linked list), and 4) A computed style object if one was calculated (this is a speed optimization that allows retrieval of starting values quicker)
		 *                      - formatter: a function that formats any value received for this special property (for example, boxShadow could take "5px 5px red" and format it to "5px 5px 0px 0px red" so that both the beginning and ending values have a common order and quantity of values.)
		 *                      - prefix: if true, we'll determine whether or not this property requires a vendor prefix (like Webkit or Moz or ms or O)
		 *                      - color: set this to true if the value for this SpecialProp may contain color-related values like rgb(), rgba(), etc.
		 *                      - priority: priority in the linked list order. Higher priority SpecialProps will be updated before lower priority ones. The default priority is 0.
		 *                      - multi: if true, the formatter should accommodate a comma-delimited list of values, like boxShadow could have multiple boxShadows listed out.
		 *                      - collapsible: if true, the formatter should treat the value like it's a top/right/bottom/left value that could be collapsed, like "5px" would apply to all, "5px, 10px" would use 5px for top/bottom and 10px for right/left, etc.
		 *                      - keyword: a special keyword that can [optionally] be found inside the value (like "inset" for boxShadow). This allows us to validate beginning/ending values to make sure they match (if the keyword is found in one, it'll be added to the other for consistency by default).
		 */
		var SpecialProp = function(p, options) {
				options = options || {};
				this.p = options.prefix ? _checkPropPrefix(p) || p : p;
				_specialProps[p] = _specialProps[this.p] = this;
				this.format = options.formatter || _getFormatter(options.defaultValue, options.color, options.collapsible, options.multi);
				if (options.parser) {
					this.parse = options.parser;
				}
				this.clrs = options.color;
				this.multi = options.multi;
				this.keyword = options.keyword;
				this.dflt = options.defaultValue;
				this.pr = options.priority || 0;
			},

			//shortcut for creating a new SpecialProp that can accept multiple properties as a comma-delimited list (helps minification). dflt can be an array for multiple values (we don't do a comma-delimited list because the default value may contain commas, like rect(0px,0px,0px,0px)). We attach this method to the SpecialProp class/object instead of using a private _createSpecialProp() method so that we can tap into it externally if necessary, like from another plugin.
			_registerComplexSpecialProp = _internals._registerComplexSpecialProp = function(p, options, defaults) {
				if (typeof(options) !== "object") {
					options = {parser:defaults}; //to make backwards compatible with older versions of BezierPlugin and ThrowPropsPlugin
				}
				var a = p.split(","),
					d = options.defaultValue,
					i, temp;
				defaults = defaults || [d];
				for (i = 0; i < a.length; i++) {
					options.prefix = (i === 0 && options.prefix);
					options.defaultValue = defaults[i] || d;
					temp = new SpecialProp(a[i], options);
				}
			},

			//creates a placeholder special prop for a plugin so that the property gets caught the first time a tween of it is attempted, and at that time it makes the plugin register itself, thus taking over for all future tweens of that property. This allows us to not mandate that things load in a particular order and it also allows us to log() an error that informs the user when they attempt to tween an external plugin-related property without loading its .js file.
			_registerPluginProp = function(p) {
				if (!_specialProps[p]) {
					var pluginName = p.charAt(0).toUpperCase() + p.substr(1) + "Plugin";
					_registerComplexSpecialProp(p, {parser:function(t, e, p, cssp, pt, plugin, vars) {
						var pluginClass = _globals.com.greensock.plugins[pluginName];
						if (!pluginClass) {
							_log("Error: " + pluginName + " js file not loaded.");
							return pt;
						}
						pluginClass._cssRegister();
						return _specialProps[p].parse(t, e, p, cssp, pt, plugin, vars);
					}});
				}
			};


		p = SpecialProp.prototype;

		/**
		 * Alias for _parseComplex() that automatically plugs in certain values for this SpecialProp, like its property name, whether or not colors should be sensed, the default value, and priority. It also looks for any keyword that the SpecialProp defines (like "inset" for boxShadow) and ensures that the beginning and ending values have the same number of values for SpecialProps where multi is true (like boxShadow and textShadow can have a comma-delimited list)
		 * @param {!Object} t target element
		 * @param {(string|number|object)} b beginning value
		 * @param {(string|number|object)} e ending (destination) value
		 * @param {CSSPropTween=} pt next CSSPropTween in the linked list
		 * @param {TweenPlugin=} plugin If another plugin will be tweening the complex value, that TweenPlugin instance goes here.
		 * @param {function=} setRatio If a custom setRatio() method should be used to handle this complex value, that goes here.
		 * @return {CSSPropTween=} First CSSPropTween in the linked list
		 */
		p.parseComplex = function(t, b, e, pt, plugin, setRatio) {
			var kwd = this.keyword,
				i, ba, ea, l, bi, ei;
			//if this SpecialProp's value can contain a comma-delimited list of values (like boxShadow or textShadow), we must parse them in a special way, and look for a keyword (like "inset" for boxShadow) and ensure that the beginning and ending BOTH have it if the end defines it as such. We also must ensure that there are an equal number of values specified (we can't tween 1 boxShadow to 3 for example)
			if (this.multi) if (_commasOutsideParenExp.test(e) || _commasOutsideParenExp.test(b)) {
				ba = b.replace(_commasOutsideParenExp, "|").split("|");
				ea = e.replace(_commasOutsideParenExp, "|").split("|");
			} else if (kwd) {
				ba = [b];
				ea = [e];
			}
			if (ea) {
				l = (ea.length > ba.length) ? ea.length : ba.length;
				for (i = 0; i < l; i++) {
					b = ba[i] = ba[i] || this.dflt;
					e = ea[i] = ea[i] || this.dflt;
					if (kwd) {
						bi = b.indexOf(kwd);
						ei = e.indexOf(kwd);
						if (bi !== ei) {
							if (ei === -1) { //if the keyword isn't in the end value, remove it from the beginning one.
								ba[i] = ba[i].split(kwd).join("");
							} else if (bi === -1) { //if the keyword isn't in the beginning, add it.
								ba[i] += " " + kwd;
							}
						}
					}
				}
				b = ba.join(", ");
				e = ea.join(", ");
			}
			return _parseComplex(t, this.p, b, e, this.clrs, this.dflt, pt, this.pr, plugin, setRatio);
		};

		/**
		 * Accepts a target and end value and spits back a CSSPropTween that has been inserted into the CSSPlugin's linked list and conforms with all the conventions we use internally, like type:-1, 0, 1, or 2, setting up any extra property tweens, priority, etc. For example, if we have a boxShadow SpecialProp and call:
		 * this._firstPT = sp.parse(element, "5px 10px 20px rgb(2550,102,51)", "boxShadow", this);
		 * It should figure out the starting value of the element's boxShadow, compare it to the provided end value and create all the necessary CSSPropTweens of the appropriate types to tween the boxShadow. The CSSPropTween that gets spit back should already be inserted into the linked list (the 4th parameter is the current head, so prepend to that).
		 * @param {!Object} t Target object whose property is being tweened
		 * @param {Object} e End value as provided in the vars object (typically a string, but not always - like a throwProps would be an object).
		 * @param {!string} p Property name
		 * @param {!CSSPlugin} cssp The CSSPlugin instance that should be associated with this tween.
		 * @param {?CSSPropTween} pt The CSSPropTween that is the current head of the linked list (we'll prepend to it)
		 * @param {TweenPlugin=} plugin If a plugin will be used to tween the parsed value, this is the plugin instance.
		 * @param {Object=} vars Original vars object that contains the data for parsing.
		 * @return {CSSPropTween} The first CSSPropTween in the linked list which includes the new one(s) added by the parse() call.
		 */
		p.parse = function(t, e, p, cssp, pt, plugin, vars) {
			return this.parseComplex(t.style, this.format(_getStyle(t, this.p, _cs, false, this.dflt)), this.format(e), pt, plugin);
		};

		/**
		 * Registers a special property that should be intercepted from any "css" objects defined in tweens. This allows you to handle them however you want without CSSPlugin doing it for you. The 2nd parameter should be a function that accepts 3 parameters:
		 *  1) Target object whose property should be tweened (typically a DOM element)
		 *  2) The end/destination value (could be a string, number, object, or whatever you want)
		 *  3) The tween instance (you probably don't need to worry about this, but it can be useful for looking up information like the duration)
		 *
		 * Then, your function should return a function which will be called each time the tween gets rendered, passing a numeric "ratio" parameter to your function that indicates the change factor (usually between 0 and 1). For example:
		 *
		 * CSSPlugin.registerSpecialProp("myCustomProp", function(target, value, tween) {
		 *      var start = target.style.width;
		 *      return function(ratio) {
		 *              target.style.width = (start + value * ratio) + "px";
		 *              console.log("set width to " + target.style.width);
		 *          }
		 * }, 0);
		 *
		 * Then, when I do this tween, it will trigger my special property:
		 *
		 * TweenLite.to(element, 1, {css:{myCustomProp:100}});
		 *
		 * In the example, of course, we're just changing the width, but you can do anything you want.
		 *
		 * @param {!string} name Property name (or comma-delimited list of property names) that should be intercepted and handled by your function. For example, if I define "myCustomProp", then it would handle that portion of the following tween: TweenLite.to(element, 1, {css:{myCustomProp:100}})
		 * @param {!function(Object, Object, Object, string):function(number)} onInitTween The function that will be called when a tween of this special property is performed. The function will receive 4 parameters: 1) Target object that should be tweened, 2) Value that was passed to the tween, 3) The tween instance itself (rarely used), and 4) The property name that's being tweened. Your function should return a function that should be called on every update of the tween. That function will receive a single parameter that is a "change factor" value (typically between 0 and 1) indicating the amount of change as a ratio. You can use this to determine how to set the values appropriately in your function.
		 * @param {number=} priority Priority that helps the engine determine the order in which to set the properties (default: 0). Higher priority properties will be updated before lower priority ones.
		 */
		CSSPlugin.registerSpecialProp = function(name, onInitTween, priority) {
			_registerComplexSpecialProp(name, {parser:function(t, e, p, cssp, pt, plugin, vars) {
				var rv = new CSSPropTween(t, p, 0, 0, pt, 2, p, false, priority);
				rv.plugin = plugin;
				rv.setRatio = onInitTween(t, e, cssp._tween, p);
				return rv;
			}, priority:priority});
		};






		//transform-related methods and properties
		CSSPlugin.useSVGTransformAttr = _isSafari || _isFirefox; //Safari and Firefox both have some rendering bugs when applying CSS transforms to SVG elements, so default to using the "transform" attribute instead (users can override this).
		var _transformProps = ("scaleX,scaleY,scaleZ,x,y,z,skewX,skewY,rotation,rotationX,rotationY,perspective,xPercent,yPercent").split(","),
			_transformProp = _checkPropPrefix("transform"), //the Javascript (camelCase) transform property, like msTransform, WebkitTransform, MozTransform, or OTransform.
			_transformPropCSS = _prefixCSS + "transform",
			_transformOriginProp = _checkPropPrefix("transformOrigin"),
			_supports3D = (_checkPropPrefix("perspective") !== null),
			Transform = _internals.Transform = function() {
				this.perspective = parseFloat(CSSPlugin.defaultTransformPerspective) || 0;
				this.force3D = (CSSPlugin.defaultForce3D === false || !_supports3D) ? false : CSSPlugin.defaultForce3D || "auto";
			},
			_SVGElement = window.SVGElement,
			_useSVGTransformAttr,
			//Some browsers (like Firefox and IE) don't honor transform-origin properly in SVG elements, so we need to manually adjust the matrix accordingly. We feature detect here rather than always doing the conversion for certain browsers because they may fix the problem at some point in the future.

			_createSVG = function(type, container, attributes) {
				var element = _doc.createElementNS("http://www.w3.org/2000/svg", type),
					reg = /([a-z])([A-Z])/g,
					p;
				for (p in attributes) {
					element.setAttributeNS(null, p.replace(reg, "$1-$2").toLowerCase(), attributes[p]);
				}
				container.appendChild(element);
				return element;
			},
			_docElement = _doc.documentElement,
			_forceSVGTransformAttr = (function() {
				//IE and Android stock don't support CSS transforms on SVG elements, so we must write them to the "transform" attribute. We populate this variable in the _parseTransform() method, and only if/when we come across an SVG element
				var force = _ieVers || (/Android/i.test(_agent) && !window.chrome),
					svg, rect, width;
				if (_doc.createElementNS && !force) { //IE8 and earlier doesn't support SVG anyway
					svg = _createSVG("svg", _docElement);
					rect = _createSVG("rect", svg, {width:100, height:50, x:100});
					width = rect.getBoundingClientRect().width;
					rect.style[_transformOriginProp] = "50% 50%";
					rect.style[_transformProp] = "scaleX(0.5)";
					force = (width === rect.getBoundingClientRect().width && !(_isFirefox && _supports3D)); //note: Firefox fails the test even though it does support CSS transforms in 3D. Since we can't push 3D stuff into the transform attribute, we force Firefox to pass the test here (as long as it does truly support 3D).
					_docElement.removeChild(svg);
				}
				return force;
			})(),
			_parseSVGOrigin = function(e, local, decoratee, absolute, smoothOrigin) {
				var tm = e._gsTransform,
					m = _getMatrix(e, true),
					v, x, y, xOrigin, yOrigin, a, b, c, d, tx, ty, determinant, xOriginOld, yOriginOld;
				if (tm) {
					xOriginOld = tm.xOrigin; //record the original values before we alter them.
					yOriginOld = tm.yOrigin;
				}
				if (!absolute || (v = absolute.split(" ")).length < 2) {
					b = e.getBBox();
					local = _parsePosition(local).split(" ");
					v = [(local[0].indexOf("%") !== -1 ? parseFloat(local[0]) / 100 * b.width : parseFloat(local[0])) + b.x,
						 (local[1].indexOf("%") !== -1 ? parseFloat(local[1]) / 100 * b.height : parseFloat(local[1])) + b.y];
				}
				decoratee.xOrigin = xOrigin = parseFloat(v[0]);
				decoratee.yOrigin = yOrigin = parseFloat(v[1]);
				if (absolute && m !== _identity2DMatrix) { //if svgOrigin is being set, we must invert the matrix and determine where the absolute point is, factoring in the current transforms. Otherwise, the svgOrigin would be based on the element's non-transformed position on the canvas.
					a = m[0];
					b = m[1];
					c = m[2];
					d = m[3];
					tx = m[4];
					ty = m[5];
					determinant = (a * d - b * c);
					x = xOrigin * (d / determinant) + yOrigin * (-c / determinant) + ((c * ty - d * tx) / determinant);
					y = xOrigin * (-b / determinant) + yOrigin * (a / determinant) - ((a * ty - b * tx) / determinant);
					xOrigin = decoratee.xOrigin = v[0] = x;
					yOrigin = decoratee.yOrigin = v[1] = y;
				}
				if (tm) { //avoid jump when transformOrigin is changed - adjust the x/y values accordingly
					if (smoothOrigin || (smoothOrigin !== false && CSSPlugin.defaultSmoothOrigin !== false)) {
						x = xOrigin - xOriginOld;
						y = yOrigin - yOriginOld;
						//originally, we simply adjusted the x and y values, but that would cause problems if, for example, you created a rotational tween part-way through an x/y tween. Managing the offset in a separate variable gives us ultimate flexibility.
						//tm.x -= x - (x * m[0] + y * m[2]);
						//tm.y -= y - (x * m[1] + y * m[3]);
						tm.xOffset += (x * m[0] + y * m[2]) - x;
						tm.yOffset += (x * m[1] + y * m[3]) - y;
					} else {
						tm.xOffset = tm.yOffset = 0;
					}
				}
				e.setAttribute("data-svg-origin", v.join(" "));
			},
			_isSVG = function(e) {
				return !!(_SVGElement && typeof(e.getBBox) === "function" && e.getCTM && (!e.parentNode || (e.parentNode.getBBox && e.parentNode.getCTM)));
			},
			_identity2DMatrix = [1,0,0,1,0,0],
			_getMatrix = function(e, force2D) {
				var tm = e._gsTransform || new Transform(),
					rnd = 100000,
					isDefault, s, m, n, dec;
				if (_transformProp) {
					s = _getStyle(e, _transformPropCSS, null, true);
				} else if (e.currentStyle) {
					//for older versions of IE, we need to interpret the filter portion that is in the format: progid:DXImageTransform.Microsoft.Matrix(M11=6.123233995736766e-17, M12=-1, M21=1, M22=6.123233995736766e-17, sizingMethod='auto expand') Notice that we need to swap b and c compared to a normal matrix.
					s = e.currentStyle.filter.match(_ieGetMatrixExp);
					s = (s && s.length === 4) ? [s[0].substr(4), Number(s[2].substr(4)), Number(s[1].substr(4)), s[3].substr(4), (tm.x || 0), (tm.y || 0)].join(",") : "";
				}
				isDefault = (!s || s === "none" || s === "matrix(1, 0, 0, 1, 0, 0)");
				if (tm.svg || (e.getBBox && _isSVG(e))) {
					if (isDefault && (e.style[_transformProp] + "").indexOf("matrix") !== -1) { //some browsers (like Chrome 40) don't correctly report transforms that are applied inline on an SVG element (they don't get included in the computed style), so we double-check here and accept matrix values
						s = e.style[_transformProp];
						isDefault = 0;
					}
					m = e.getAttribute("transform");
					if (isDefault && m) {
						if (m.indexOf("matrix") !== -1) { //just in case there's a "transform" value specified as an attribute instead of CSS style. Accept either a matrix() or simple translate() value though.
							s = m;
							isDefault = 0;
						} else if (m.indexOf("translate") !== -1) {
							s = "matrix(1,0,0,1," + m.match(/(?:\-|\b)[\d\-\.e]+\b/gi).join(",") + ")";
							isDefault = 0;
						}
					}
				}
				if (isDefault) {
					return _identity2DMatrix;
				}
				//split the matrix values out into an array (m for matrix)
				m = (s || "").match(/(?:\-|\b)[\d\-\.e]+\b/gi) || [];
				i = m.length;
				while (--i > -1) {
					n = Number(m[i]);
					m[i] = (dec = n - (n |= 0)) ? ((dec * rnd + (dec < 0 ? -0.5 : 0.5)) | 0) / rnd + n : n; //convert strings to Numbers and round to 5 decimal places to avoid issues with tiny numbers. Roughly 20x faster than Number.toFixed(). We also must make sure to round before dividing so that values like 0.9999999999 become 1 to avoid glitches in browser rendering and interpretation of flipped/rotated 3D matrices. And don't just multiply the number by rnd, floor it, and then divide by rnd because the bitwise operations max out at a 32-bit signed integer, thus it could get clipped at a relatively low value (like 22,000.00000 for example).
				}
				return (force2D && m.length > 6) ? [m[0], m[1], m[4], m[5], m[12], m[13]] : m;
			},

			/**
			 * Parses the transform values for an element, returning an object with x, y, z, scaleX, scaleY, scaleZ, rotation, rotationX, rotationY, skewX, and skewY properties. Note: by default (for performance reasons), all skewing is combined into skewX and rotation but skewY still has a place in the transform object so that we can record how much of the skew is attributed to skewX vs skewY. Remember, a skewY of 10 looks the same as a rotation of 10 and skewX of -10.
			 * @param {!Object} t target element
			 * @param {Object=} cs computed style object (optional)
			 * @param {boolean=} rec if true, the transform values will be recorded to the target element's _gsTransform object, like target._gsTransform = {x:0, y:0, z:0, scaleX:1...}
			 * @param {boolean=} parse if true, we'll ignore any _gsTransform values that already exist on the element, and force a reparsing of the css (calculated style)
			 * @return {object} object containing all of the transform properties/values like {x:0, y:0, z:0, scaleX:1...}
			 */
			_getTransform = _internals.getTransform = function(t, cs, rec, parse) {
				if (t._gsTransform && rec && !parse) {
					return t._gsTransform; //if the element already has a _gsTransform, use that. Note: some browsers don't accurately return the calculated style for the transform (particularly for SVG), so it's almost always safest to just use the values we've already applied rather than re-parsing things.
				}
				var tm = rec ? t._gsTransform || new Transform() : new Transform(),
					invX = (tm.scaleX < 0), //in order to interpret things properly, we need to know if the user applied a negative scaleX previously so that we can adjust the rotation and skewX accordingly. Otherwise, if we always interpret a flipped matrix as affecting scaleY and the user only wants to tween the scaleX on multiple sequential tweens, it would keep the negative scaleY without that being the user's intent.
					min = 0.00002,
					rnd = 100000,
					zOrigin = _supports3D ? parseFloat(_getStyle(t, _transformOriginProp, cs, false, "0 0 0").split(" ")[2]) || tm.zOrigin  || 0 : 0,
					defaultTransformPerspective = parseFloat(CSSPlugin.defaultTransformPerspective) || 0,
					m, i, scaleX, scaleY, rotation, skewX;

				tm.svg = !!(t.getBBox && _isSVG(t));
				if (tm.svg) {
					_parseSVGOrigin(t, _getStyle(t, _transformOriginProp, _cs, false, "50% 50%") + "", tm, t.getAttribute("data-svg-origin"));
					_useSVGTransformAttr = CSSPlugin.useSVGTransformAttr || _forceSVGTransformAttr;
				}
				m = _getMatrix(t);
				if (m !== _identity2DMatrix) {

					if (m.length === 16) {
						//we'll only look at these position-related 6 variables first because if x/y/z all match, it's relatively safe to assume we don't need to re-parse everything which risks losing important rotational information (like rotationX:180 plus rotationY:180 would look the same as rotation:180 - there's no way to know for sure which direction was taken based solely on the matrix3d() values)
						var a11 = m[0], a21 = m[1], a31 = m[2], a41 = m[3],
							a12 = m[4], a22 = m[5], a32 = m[6], a42 = m[7],
							a13 = m[8], a23 = m[9], a33 = m[10],
							a14 = m[12], a24 = m[13], a34 = m[14],
							a43 = m[11],
							angle = Math.atan2(a32, a33),
							t1, t2, t3, t4, cos, sin;

						//we manually compensate for non-zero z component of transformOrigin to work around bugs in Safari
						if (tm.zOrigin) {
							a34 = -tm.zOrigin;
							a14 = a13*a34-m[12];
							a24 = a23*a34-m[13];
							a34 = a33*a34+tm.zOrigin-m[14];
						}
						tm.rotationX = angle * _RAD2DEG;
						//rotationX
						if (angle) {
							cos = Math.cos(-angle);
							sin = Math.sin(-angle);
							t1 = a12*cos+a13*sin;
							t2 = a22*cos+a23*sin;
							t3 = a32*cos+a33*sin;
							a13 = a12*-sin+a13*cos;
							a23 = a22*-sin+a23*cos;
							a33 = a32*-sin+a33*cos;
							a43 = a42*-sin+a43*cos;
							a12 = t1;
							a22 = t2;
							a32 = t3;
						}
						//rotationY
						angle = Math.atan2(a13, a33);
						tm.rotationY = angle * _RAD2DEG;
						if (angle) {
							cos = Math.cos(-angle);
							sin = Math.sin(-angle);
							t1 = a11*cos-a13*sin;
							t2 = a21*cos-a23*sin;
							t3 = a31*cos-a33*sin;
							a23 = a21*sin+a23*cos;
							a33 = a31*sin+a33*cos;
							a43 = a41*sin+a43*cos;
							a11 = t1;
							a21 = t2;
							a31 = t3;
						}
						//rotationZ
						angle = Math.atan2(a21, a11);
						tm.rotation = angle * _RAD2DEG;
						if (angle) {
							cos = Math.cos(-angle);
							sin = Math.sin(-angle);
							a11 = a11*cos+a12*sin;
							t2 = a21*cos+a22*sin;
							a22 = a21*-sin+a22*cos;
							a32 = a31*-sin+a32*cos;
							a21 = t2;
						}

						if (tm.rotationX && Math.abs(tm.rotationX) + Math.abs(tm.rotation) > 359.9) { //when rotationY is set, it will often be parsed as 180 degrees different than it should be, and rotationX and rotation both being 180 (it looks the same), so we adjust for that here.
							tm.rotationX = tm.rotation = 0;
							tm.rotationY += 180;
						}

						tm.scaleX = ((Math.sqrt(a11 * a11 + a21 * a21) * rnd + 0.5) | 0) / rnd;
						tm.scaleY = ((Math.sqrt(a22 * a22 + a23 * a23) * rnd + 0.5) | 0) / rnd;
						tm.scaleZ = ((Math.sqrt(a32 * a32 + a33 * a33) * rnd + 0.5) | 0) / rnd;
						tm.skewX = 0;
						tm.perspective = a43 ? 1 / ((a43 < 0) ? -a43 : a43) : 0;
						tm.x = a14;
						tm.y = a24;
						tm.z = a34;
						if (tm.svg) {
							tm.x -= tm.xOrigin - (tm.xOrigin * a11 - tm.yOrigin * a12);
							tm.y -= tm.yOrigin - (tm.yOrigin * a21 - tm.xOrigin * a22);
						}

					} else if ((!_supports3D || parse || !m.length || tm.x !== m[4] || tm.y !== m[5] || (!tm.rotationX && !tm.rotationY)) && !(tm.x !== undefined && _getStyle(t, "display", cs) === "none")) { //sometimes a 6-element matrix is returned even when we performed 3D transforms, like if rotationX and rotationY are 180. In cases like this, we still need to honor the 3D transforms. If we just rely on the 2D info, it could affect how the data is interpreted, like scaleY might get set to -1 or rotation could get offset by 180 degrees. For example, do a TweenLite.to(element, 1, {css:{rotationX:180, rotationY:180}}) and then later, TweenLite.to(element, 1, {css:{rotationX:0}}) and without this conditional logic in place, it'd jump to a state of being unrotated when the 2nd tween starts. Then again, we need to honor the fact that the user COULD alter the transforms outside of CSSPlugin, like by manually applying new css, so we try to sense that by looking at x and y because if those changed, we know the changes were made outside CSSPlugin and we force a reinterpretation of the matrix values. Also, in Webkit browsers, if the element's "display" is "none", its calculated style value will always return empty, so if we've already recorded the values in the _gsTransform object, we'll just rely on those.
						var k = (m.length >= 6),
							a = k ? m[0] : 1,
							b = m[1] || 0,
							c = m[2] || 0,
							d = k ? m[3] : 1;
						tm.x = m[4] || 0;
						tm.y = m[5] || 0;
						scaleX = Math.sqrt(a * a + b * b);
						scaleY = Math.sqrt(d * d + c * c);
						rotation = (a || b) ? Math.atan2(b, a) * _RAD2DEG : tm.rotation || 0; //note: if scaleX is 0, we cannot accurately measure rotation. Same for skewX with a scaleY of 0. Therefore, we default to the previously recorded value (or zero if that doesn't exist).
						skewX = (c || d) ? Math.atan2(c, d) * _RAD2DEG + rotation : tm.skewX || 0;
						if (Math.abs(skewX) > 90 && Math.abs(skewX) < 270) {
							if (invX) {
								scaleX *= -1;
								skewX += (rotation <= 0) ? 180 : -180;
								rotation += (rotation <= 0) ? 180 : -180;
							} else {
								scaleY *= -1;
								skewX += (skewX <= 0) ? 180 : -180;
							}
						}
						tm.scaleX = scaleX;
						tm.scaleY = scaleY;
						tm.rotation = rotation;
						tm.skewX = skewX;
						if (_supports3D) {
							tm.rotationX = tm.rotationY = tm.z = 0;
							tm.perspective = defaultTransformPerspective;
							tm.scaleZ = 1;
						}
						if (tm.svg) {
							tm.x -= tm.xOrigin - (tm.xOrigin * a + tm.yOrigin * c);
							tm.y -= tm.yOrigin - (tm.xOrigin * b + tm.yOrigin * d);
						}
					}
					tm.zOrigin = zOrigin;
					//some browsers have a hard time with very small values like 2.4492935982947064e-16 (notice the "e-" towards the end) and would render the object slightly off. So we round to 0 in these cases. The conditional logic here is faster than calling Math.abs(). Also, browsers tend to render a SLIGHTLY rotated object in a fuzzy way, so we need to snap to exactly 0 when appropriate.
					for (i in tm) {
						if (tm[i] < min) if (tm[i] > -min) {
							tm[i] = 0;
						}
					}
				}
				//DEBUG: _log("parsed rotation of " + t.getAttribute("id")+": "+(tm.rotationX)+", "+(tm.rotationY)+", "+(tm.rotation)+", scale: "+tm.scaleX+", "+tm.scaleY+", "+tm.scaleZ+", position: "+tm.x+", "+tm.y+", "+tm.z+", perspective: "+tm.perspective+ ", origin: "+ tm.xOrigin+ ","+ tm.yOrigin);
				if (rec) {
					t._gsTransform = tm; //record to the object's _gsTransform which we use so that tweens can control individual properties independently (we need all the properties to accurately recompose the matrix in the setRatio() method)
					if (tm.svg) { //if we're supposed to apply transforms to the SVG element's "transform" attribute, make sure there aren't any CSS transforms applied or they'll override the attribute ones. Also clear the transform attribute if we're using CSS, just to be clean.
						if (_useSVGTransformAttr && t.style[_transformProp]) {
							TweenLite.delayedCall(0.001, function(){ //if we apply this right away (before anything has rendered), we risk there being no transforms for a brief moment and it also interferes with adjusting the transformOrigin in a tween with immediateRender:true (it'd try reading the matrix and it wouldn't have the appropriate data in place because we just removed it).
								_removeProp(t.style, _transformProp);
							});
						} else if (!_useSVGTransformAttr && t.getAttribute("transform")) {
							TweenLite.delayedCall(0.001, function(){
								t.removeAttribute("transform");
							});
						}
					}
				}
				return tm;
			},

			//for setting 2D transforms in IE6, IE7, and IE8 (must use a "filter" to emulate the behavior of modern day browser transforms)
			_setIETransformRatio = function(v) {
				var t = this.data, //refers to the element's _gsTransform object
					ang = -t.rotation * _DEG2RAD,
					skew = ang + t.skewX * _DEG2RAD,
					rnd = 100000,
					a = ((Math.cos(ang) * t.scaleX * rnd) | 0) / rnd,
					b = ((Math.sin(ang) * t.scaleX * rnd) | 0) / rnd,
					c = ((Math.sin(skew) * -t.scaleY * rnd) | 0) / rnd,
					d = ((Math.cos(skew) * t.scaleY * rnd) | 0) / rnd,
					style = this.t.style,
					cs = this.t.currentStyle,
					filters, val;
				if (!cs) {
					return;
				}
				val = b; //just for swapping the variables an inverting them (reused "val" to avoid creating another variable in memory). IE's filter matrix uses a non-standard matrix configuration (angle goes the opposite way, and b and c are reversed and inverted)
				b = -c;
				c = -val;
				filters = cs.filter;
				style.filter = ""; //remove filters so that we can accurately measure offsetWidth/offsetHeight
				var w = this.t.offsetWidth,
					h = this.t.offsetHeight,
					clip = (cs.position !== "absolute"),
					m = "progid:DXImageTransform.Microsoft.Matrix(M11=" + a + ", M12=" + b + ", M21=" + c + ", M22=" + d,
					ox = t.x + (w * t.xPercent / 100),
					oy = t.y + (h * t.yPercent / 100),
					dx, dy;

				//if transformOrigin is being used, adjust the offset x and y
				if (t.ox != null) {
					dx = ((t.oxp) ? w * t.ox * 0.01 : t.ox) - w / 2;
					dy = ((t.oyp) ? h * t.oy * 0.01 : t.oy) - h / 2;
					ox += dx - (dx * a + dy * b);
					oy += dy - (dx * c + dy * d);
				}

				if (!clip) {
					m += ", sizingMethod='auto expand')";
				} else {
					dx = (w / 2);
					dy = (h / 2);
					//translate to ensure that transformations occur around the correct origin (default is center).
					m += ", Dx=" + (dx - (dx * a + dy * b) + ox) + ", Dy=" + (dy - (dx * c + dy * d) + oy) + ")";
				}
				if (filters.indexOf("DXImageTransform.Microsoft.Matrix(") !== -1) {
					style.filter = filters.replace(_ieSetMatrixExp, m);
				} else {
					style.filter = m + " " + filters; //we must always put the transform/matrix FIRST (before alpha(opacity=xx)) to avoid an IE bug that slices part of the object when rotation is applied with alpha.
				}

				//at the end or beginning of the tween, if the matrix is normal (1, 0, 0, 1) and opacity is 100 (or doesn't exist), remove the filter to improve browser performance.
				if (v === 0 || v === 1) if (a === 1) if (b === 0) if (c === 0) if (d === 1) if (!clip || m.indexOf("Dx=0, Dy=0") !== -1) if (!_opacityExp.test(filters) || parseFloat(RegExp.$1) === 100) if (filters.indexOf("gradient(" && filters.indexOf("Alpha")) === -1) {
					style.removeAttribute("filter");
				}

				//we must set the margins AFTER applying the filter in order to avoid some bugs in IE8 that could (in rare scenarios) cause them to be ignored intermittently (vibration).
				if (!clip) {
					var mult = (_ieVers < 8) ? 1 : -1, //in Internet Explorer 7 and before, the box model is broken, causing the browser to treat the width/height of the actual rotated filtered image as the width/height of the box itself, but Microsoft corrected that in IE8. We must use a negative offset in IE8 on the right/bottom
						marg, prop, dif;
					dx = t.ieOffsetX || 0;
					dy = t.ieOffsetY || 0;
					t.ieOffsetX = Math.round((w - ((a < 0 ? -a : a) * w + (b < 0 ? -b : b) * h)) / 2 + ox);
					t.ieOffsetY = Math.round((h - ((d < 0 ? -d : d) * h + (c < 0 ? -c : c) * w)) / 2 + oy);
					for (i = 0; i < 4; i++) {
						prop = _margins[i];
						marg = cs[prop];
						//we need to get the current margin in case it is being tweened separately (we want to respect that tween's changes)
						val = (marg.indexOf("px") !== -1) ? parseFloat(marg) : _convertToPixels(this.t, prop, parseFloat(marg), marg.replace(_suffixExp, "")) || 0;
						if (val !== t[prop]) {
							dif = (i < 2) ? -t.ieOffsetX : -t.ieOffsetY; //if another tween is controlling a margin, we cannot only apply the difference in the ieOffsets, so we essentially zero-out the dx and dy here in that case. We record the margin(s) later so that we can keep comparing them, making this code very flexible.
						} else {
							dif = (i < 2) ? dx - t.ieOffsetX : dy - t.ieOffsetY;
						}
						style[prop] = (t[prop] = Math.round( val - dif * ((i === 0 || i === 2) ? 1 : mult) )) + "px";
					}
				}
			},

			/* translates a super small decimal to a string WITHOUT scientific notation
			_safeDecimal = function(n) {
				var s = (n < 0 ? -n : n) + "",
					a = s.split("e-");
				return (n < 0 ? "-0." : "0.") + new Array(parseInt(a[1], 10) || 0).join("0") + a[0].split(".").join("");
			},
			*/

			_setTransformRatio = _internals.set3DTransformRatio = _internals.setTransformRatio = function(v) {
				var t = this.data, //refers to the element's _gsTransform object
					style = this.t.style,
					angle = t.rotation,
					rotationX = t.rotationX,
					rotationY = t.rotationY,
					sx = t.scaleX,
					sy = t.scaleY,
					sz = t.scaleZ,
					x = t.x,
					y = t.y,
					z = t.z,
					isSVG = t.svg,
					perspective = t.perspective,
					force3D = t.force3D,
					a11, a12, a13, a21, a22, a23, a31, a32, a33, a41, a42, a43,
					zOrigin, min, cos, sin, t1, t2, transform, comma, zero, skew, rnd;
				//check to see if we should render as 2D (and SVGs must use 2D when _useSVGTransformAttr is true)
				if (((((v === 1 || v === 0) && force3D === "auto" && (this.tween._totalTime === this.tween._totalDuration || !this.tween._totalTime)) || !force3D) && !z && !perspective && !rotationY && !rotationX) || (_useSVGTransformAttr && isSVG) || !_supports3D) { //on the final render (which could be 0 for a from tween), if there are no 3D aspects, render in 2D to free up memory and improve performance especially on mobile devices. Check the tween's totalTime/totalDuration too in order to make sure it doesn't happen between repeats if it's a repeating tween.

					//2D
					if (angle || t.skewX || isSVG) {
						angle *= _DEG2RAD;
						skew = t.skewX * _DEG2RAD;
						rnd = 100000;
						a11 = Math.cos(angle) * sx;
						a21 = Math.sin(angle) * sx;
						a12 = Math.sin(angle - skew) * -sy;
						a22 = Math.cos(angle - skew) * sy;
						if (skew && t.skewType === "simple") { //by default, we compensate skewing on the other axis to make it look more natural, but you can set the skewType to "simple" to use the uncompensated skewing that CSS does
							t1 = Math.tan(skew);
							t1 = Math.sqrt(1 + t1 * t1);
							a12 *= t1;
							a22 *= t1;
							if (t.skewY) {
								a11 *= t1;
								a21 *= t1;
							}
						}
						if (isSVG) {
							x += t.xOrigin - (t.xOrigin * a11 + t.yOrigin * a12) + t.xOffset;
							y += t.yOrigin - (t.xOrigin * a21 + t.yOrigin * a22) + t.yOffset;
							if (_useSVGTransformAttr && (t.xPercent || t.yPercent)) { //The SVG spec doesn't support percentage-based translation in the "transform" attribute, so we merge it into the matrix to simulate it.
								min = this.t.getBBox();
								x += t.xPercent * 0.01 * min.width;
								y += t.yPercent * 0.01 * min.height;
							}
							min = 0.000001;
							if (x < min) if (x > -min) {
								x = 0;
							}
							if (y < min) if (y > -min) {
								y = 0;
							}
						}
						transform = (((a11 * rnd) | 0) / rnd) + "," + (((a21 * rnd) | 0) / rnd) + "," + (((a12 * rnd) | 0) / rnd) + "," + (((a22 * rnd) | 0) / rnd) + "," + x + "," + y + ")";
						if (isSVG && _useSVGTransformAttr) {
							this.t.setAttribute("transform", "matrix(" + transform);
						} else {
							//some browsers have a hard time with very small values like 2.4492935982947064e-16 (notice the "e-" towards the end) and would render the object slightly off. So we round to 5 decimal places.
							style[_transformProp] = ((t.xPercent || t.yPercent) ? "translate(" + t.xPercent + "%," + t.yPercent + "%) matrix(" : "matrix(") + transform;
						}
					} else {
						style[_transformProp] = ((t.xPercent || t.yPercent) ? "translate(" + t.xPercent + "%," + t.yPercent + "%) matrix(" : "matrix(") + sx + ",0,0," + sy + "," + x + "," + y + ")";
					}
					return;

				}
				if (_isFirefox) { //Firefox has a bug (at least in v25) that causes it to render the transparent part of 32-bit PNG images as black when displayed inside an iframe and the 3D scale is very small and doesn't change sufficiently enough between renders (like if you use a Power4.easeInOut to scale from 0 to 1 where the beginning values only change a tiny amount to begin the tween before accelerating). In this case, we force the scale to be 0.00002 instead which is visually the same but works around the Firefox issue.
					min = 0.0001;
					if (sx < min && sx > -min) {
						sx = sz = 0.00002;
					}
					if (sy < min && sy > -min) {
						sy = sz = 0.00002;
					}
					if (perspective && !t.z && !t.rotationX && !t.rotationY) { //Firefox has a bug that causes elements to have an odd super-thin, broken/dotted black border on elements that have a perspective set but aren't utilizing 3D space (no rotationX, rotationY, or z).
						perspective = 0;
					}
				}
				if (angle || t.skewX) {
					angle *= _DEG2RAD;
					cos = a11 = Math.cos(angle);
					sin = a21 = Math.sin(angle);
					if (t.skewX) {
						angle -= t.skewX * _DEG2RAD;
						cos = Math.cos(angle);
						sin = Math.sin(angle);
						if (t.skewType === "simple") { //by default, we compensate skewing on the other axis to make it look more natural, but you can set the skewType to "simple" to use the uncompensated skewing that CSS does
							t1 = Math.tan(t.skewX * _DEG2RAD);
							t1 = Math.sqrt(1 + t1 * t1);
							cos *= t1;
							sin *= t1;
							if (t.skewY) {
								a11 *= t1;
								a21 *= t1;
							}
						}
					}
					a12 = -sin;
					a22 = cos;

				} else if (!rotationY && !rotationX && sz === 1 && !perspective && !isSVG) { //if we're only translating and/or 2D scaling, this is faster...
					style[_transformProp] = ((t.xPercent || t.yPercent) ? "translate(" + t.xPercent + "%," + t.yPercent + "%) translate3d(" : "translate3d(") + x + "px," + y + "px," + z +"px)" + ((sx !== 1 || sy !== 1) ? " scale(" + sx + "," + sy + ")" : "");
					return;
				} else {
					a11 = a22 = 1;
					a12 = a21 = 0;
				}
				// KEY  INDEX   AFFECTS
				// a11  0       rotation, rotationY, scaleX
				// a21  1       rotation, rotationY, scaleX
				// a31  2       rotationY, scaleX
				// a41  3       rotationY, scaleX
				// a12  4       rotation, skewX, rotationX, scaleY
				// a22  5       rotation, skewX, rotationX, scaleY
				// a32  6       rotationX, scaleY
				// a42  7       rotationX, scaleY
				// a13  8       rotationY, rotationX, scaleZ
				// a23  9       rotationY, rotationX, scaleZ
				// a33  10      rotationY, rotationX, scaleZ
				// a43  11      rotationY, rotationX, perspective, scaleZ
				// a14  12      x, zOrigin, svgOrigin
				// a24  13      y, zOrigin, svgOrigin
				// a34  14      z, zOrigin
				// a44  15
				// rotation: Math.atan2(a21, a11)
				// rotationY: Math.atan2(a13, a33) (or Math.atan2(a13, a11))
				// rotationX: Math.atan2(a32, a33)
				a33 = 1;
				a13 = a23 = a31 = a32 = a41 = a42 = 0;
				a43 = (perspective) ? -1 / perspective : 0;
				zOrigin = t.zOrigin;
				min = 0.000001; //threshold below which browsers use scientific notation which won't work.
				comma = ",";
				zero = "0";
				angle = rotationY * _DEG2RAD;
				if (angle) {
					cos = Math.cos(angle);
					sin = Math.sin(angle);
					a31 = -sin;
					a41 = a43*-sin;
					a13 = a11*sin;
					a23 = a21*sin;
					a33 = cos;
					a43 *= cos;
					a11 *= cos;
					a21 *= cos;
				}
				angle = rotationX * _DEG2RAD;
				if (angle) {
					cos = Math.cos(angle);
					sin = Math.sin(angle);
					t1 = a12*cos+a13*sin;
					t2 = a22*cos+a23*sin;
					a32 = a33*sin;
					a42 = a43*sin;
					a13 = a12*-sin+a13*cos;
					a23 = a22*-sin+a23*cos;
					a33 = a33*cos;
					a43 = a43*cos;
					a12 = t1;
					a22 = t2;
				}
				if (sz !== 1) {
					a13*=sz;
					a23*=sz;
					a33*=sz;
					a43*=sz;
				}
				if (sy !== 1) {
					a12*=sy;
					a22*=sy;
					a32*=sy;
					a42*=sy;
				}
				if (sx !== 1) {
					a11*=sx;
					a21*=sx;
					a31*=sx;
					a41*=sx;
				}

				if (zOrigin || isSVG) {
					if (zOrigin) {
						x += a13*-zOrigin;
						y += a23*-zOrigin;
						z += a33*-zOrigin+zOrigin;
					}
					if (isSVG) { //due to bugs in some browsers, we need to manage the transform-origin of SVG manually
						x += t.xOrigin - (t.xOrigin * a11 + t.yOrigin * a12) + t.xOffset;
						y += t.yOrigin - (t.xOrigin * a21 + t.yOrigin * a22) + t.yOffset;
					}
					if (x < min && x > -min) {
						x = zero;
					}
					if (y < min && y > -min) {
						y = zero;
					}
					if (z < min && z > -min) {
						z = 0; //don't use string because we calculate perspective later and need the number.
					}
				}

				//optimized way of concatenating all the values into a string. If we do it all in one shot, it's slower because of the way browsers have to create temp strings and the way it affects memory. If we do it piece-by-piece with +=, it's a bit slower too. We found that doing it in these sized chunks works best overall:
				transform = ((t.xPercent || t.yPercent) ? "translate(" + t.xPercent + "%," + t.yPercent + "%) matrix3d(" : "matrix3d(");
				transform += ((a11 < min && a11 > -min) ? zero : a11) + comma + ((a21 < min && a21 > -min) ? zero : a21) + comma + ((a31 < min && a31 > -min) ? zero : a31);
				transform += comma + ((a41 < min && a41 > -min) ? zero : a41) + comma + ((a12 < min && a12 > -min) ? zero : a12) + comma + ((a22 < min && a22 > -min) ? zero : a22);
				if (rotationX || rotationY) { //performance optimization (often there's no rotationX or rotationY, so we can skip these calculations)
					transform += comma + ((a32 < min && a32 > -min) ? zero : a32) + comma + ((a42 < min && a42 > -min) ? zero : a42) + comma + ((a13 < min && a13 > -min) ? zero : a13);
					transform += comma + ((a23 < min && a23 > -min) ? zero : a23) + comma + ((a33 < min && a33 > -min) ? zero : a33) + comma + ((a43 < min && a43 > -min) ? zero : a43) + comma;
				} else {
					transform += ",0,0,0,0,1,0,";
				}
				transform += x + comma + y + comma + z + comma + (perspective ? (1 + (-z / perspective)) : 1) + ")";

				style[_transformProp] = transform;
			};

		p = Transform.prototype;
		p.x = p.y = p.z = p.skewX = p.skewY = p.rotation = p.rotationX = p.rotationY = p.zOrigin = p.xPercent = p.yPercent = p.xOffset = p.yOffset = 0;
		p.scaleX = p.scaleY = p.scaleZ = 1;

		_registerComplexSpecialProp("transform,scale,scaleX,scaleY,scaleZ,x,y,z,rotation,rotationX,rotationY,rotationZ,skewX,skewY,shortRotation,shortRotationX,shortRotationY,shortRotationZ,transformOrigin,svgOrigin,transformPerspective,directionalRotation,parseTransform,force3D,skewType,xPercent,yPercent,smoothOrigin", {parser:function(t, e, p, cssp, pt, plugin, vars) {
			if (cssp._lastParsedTransform === vars) { return pt; } //only need to parse the transform once, and only if the browser supports it.
			cssp._lastParsedTransform = vars;
			var originalGSTransform = t._gsTransform,
				style = t.style,
				min = 0.000001,
				i = _transformProps.length,
				v = vars,
				endRotations = {},
				transformOriginString = "transformOrigin",
				m1, m2, skewY, copy, orig, has3D, hasChange, dr, x, y;
			if (vars.display) { //if the user is setting display during this tween, it may not be instantiated yet but we must force it here in order to get accurate readings. If display is "none", some browsers refuse to report the transform properties correctly.
				copy = _getStyle(t, "display");
				style.display = "block";
				m1 = _getTransform(t, _cs, true, vars.parseTransform);
				style.display = copy;
			} else {
				m1 = _getTransform(t, _cs, true, vars.parseTransform);
			}
			cssp._transform = m1;
			if (typeof(v.transform) === "string" && _transformProp) { //for values like transform:"rotate(60deg) scale(0.5, 0.8)"
				copy = _tempDiv.style; //don't use the original target because it might be SVG in which case some browsers don't report computed style correctly.
				copy[_transformProp] = v.transform;
				copy.display = "block"; //if display is "none", the browser often refuses to report the transform properties correctly.
				copy.position = "absolute";
				_doc.body.appendChild(_tempDiv);
				m2 = _getTransform(_tempDiv, null, false);
				_doc.body.removeChild(_tempDiv);
				if (!m2.perspective) {
					m2.perspective = m1.perspective; //tweening to no perspective gives very unintuitive results - just keep the same perspective in that case.
				}
				if (v.xPercent != null) {
					m2.xPercent = _parseVal(v.xPercent, m1.xPercent);
				}
				if (v.yPercent != null) {
					m2.yPercent = _parseVal(v.yPercent, m1.yPercent);
				}
			} else if (typeof(v) === "object") { //for values like scaleX, scaleY, rotation, x, y, skewX, and skewY or transform:{...} (object)
				m2 = {scaleX:_parseVal((v.scaleX != null) ? v.scaleX : v.scale, m1.scaleX),
					scaleY:_parseVal((v.scaleY != null) ? v.scaleY : v.scale, m1.scaleY),
					scaleZ:_parseVal(v.scaleZ, m1.scaleZ),
					x:_parseVal(v.x, m1.x),
					y:_parseVal(v.y, m1.y),
					z:_parseVal(v.z, m1.z),
					xPercent:_parseVal(v.xPercent, m1.xPercent),
					yPercent:_parseVal(v.yPercent, m1.yPercent),
					perspective:_parseVal(v.transformPerspective, m1.perspective)};
				dr = v.directionalRotation;
				if (dr != null) {
					if (typeof(dr) === "object") {
						for (copy in dr) {
							v[copy] = dr[copy];
						}
					} else {
						v.rotation = dr;
					}
				}
				if (typeof(v.x) === "string" && v.x.indexOf("%") !== -1) {
					m2.x = 0;
					m2.xPercent = _parseVal(v.x, m1.xPercent);
				}
				if (typeof(v.y) === "string" && v.y.indexOf("%") !== -1) {
					m2.y = 0;
					m2.yPercent = _parseVal(v.y, m1.yPercent);
				}

				m2.rotation = _parseAngle(("rotation" in v) ? v.rotation : ("shortRotation" in v) ? v.shortRotation + "_short" : ("rotationZ" in v) ? v.rotationZ : m1.rotation, m1.rotation, "rotation", endRotations);
				if (_supports3D) {
					m2.rotationX = _parseAngle(("rotationX" in v) ? v.rotationX : ("shortRotationX" in v) ? v.shortRotationX + "_short" : m1.rotationX || 0, m1.rotationX, "rotationX", endRotations);
					m2.rotationY = _parseAngle(("rotationY" in v) ? v.rotationY : ("shortRotationY" in v) ? v.shortRotationY + "_short" : m1.rotationY || 0, m1.rotationY, "rotationY", endRotations);
				}
				m2.skewX = (v.skewX == null) ? m1.skewX : _parseAngle(v.skewX, m1.skewX);

				//note: for performance reasons, we combine all skewing into the skewX and rotation values, ignoring skewY but we must still record it so that we can discern how much of the overall skew is attributed to skewX vs. skewY. Otherwise, if the skewY would always act relative (tween skewY to 10deg, for example, multiple times and if we always combine things into skewX, we can't remember that skewY was 10 from last time). Remember, a skewY of 10 degrees looks the same as a rotation of 10 degrees plus a skewX of -10 degrees.
				m2.skewY = (v.skewY == null) ? m1.skewY : _parseAngle(v.skewY, m1.skewY);
				if ((skewY = m2.skewY - m1.skewY)) {
					m2.skewX += skewY;
					m2.rotation += skewY;
				}
			}
			if (_supports3D && v.force3D != null) {
				m1.force3D = v.force3D;
				hasChange = true;
			}

			m1.skewType = v.skewType || m1.skewType || CSSPlugin.defaultSkewType;

			has3D = (m1.force3D || m1.z || m1.rotationX || m1.rotationY || m2.z || m2.rotationX || m2.rotationY || m2.perspective);
			if (!has3D && v.scale != null) {
				m2.scaleZ = 1; //no need to tween scaleZ.
			}

			while (--i > -1) {
				p = _transformProps[i];
				orig = m2[p] - m1[p];
				if (orig > min || orig < -min || v[p] != null || _forcePT[p] != null) {
					hasChange = true;
					pt = new CSSPropTween(m1, p, m1[p], orig, pt);
					if (p in endRotations) {
						pt.e = endRotations[p]; //directional rotations typically have compensated values during the tween, but we need to make sure they end at exactly what the user requested
					}
					pt.xs0 = 0; //ensures the value stays numeric in setRatio()
					pt.plugin = plugin;
					cssp._overwriteProps.push(pt.n);
				}
			}

			orig = v.transformOrigin;
			if (m1.svg && (orig || v.svgOrigin)) {
				x = m1.xOffset; //when we change the origin, in order to prevent things from jumping we adjust the x/y so we must record those here so that we can create PropTweens for them and flip them at the same time as the origin
				y = m1.yOffset;
				_parseSVGOrigin(t, _parsePosition(orig), m2, v.svgOrigin, v.smoothOrigin);
				pt = _addNonTweeningNumericPT(m1, "xOrigin", (originalGSTransform ? m1 : m2).xOrigin, m2.xOrigin, pt, transformOriginString); //note: if there wasn't a transformOrigin defined yet, just start with the destination one; it's wasteful otherwise, and it causes problems with fromTo() tweens. For example, TweenLite.to("#wheel", 3, {rotation:180, transformOrigin:"50% 50%", delay:1}); TweenLite.fromTo("#wheel", 3, {scale:0.5, transformOrigin:"50% 50%"}, {scale:1, delay:2}); would cause a jump when the from values revert at the beginning of the 2nd tween.
				pt = _addNonTweeningNumericPT(m1, "yOrigin", (originalGSTransform ? m1 : m2).yOrigin, m2.yOrigin, pt, transformOriginString);
				if (x !== m1.xOffset || y !== m1.yOffset) {
					pt = _addNonTweeningNumericPT(m1, "xOffset", (originalGSTransform ? x : m1.xOffset), m1.xOffset, pt, transformOriginString);
					pt = _addNonTweeningNumericPT(m1, "yOffset", (originalGSTransform ? y : m1.yOffset), m1.yOffset, pt, transformOriginString);
				}
				orig = _useSVGTransformAttr ? null : "0px 0px"; //certain browsers (like firefox) completely botch transform-origin, so we must remove it to prevent it from contaminating transforms. We manage it ourselves with xOrigin and yOrigin
			}
			if (orig || (_supports3D && has3D && m1.zOrigin)) { //if anything 3D is happening and there's a transformOrigin with a z component that's non-zero, we must ensure that the transformOrigin's z-component is set to 0 so that we can manually do those calculations to get around Safari bugs. Even if the user didn't specifically define a "transformOrigin" in this particular tween (maybe they did it via css directly).
				if (_transformProp) {
					hasChange = true;
					p = _transformOriginProp;
					orig = (orig || _getStyle(t, p, _cs, false, "50% 50%")) + ""; //cast as string to avoid errors
					pt = new CSSPropTween(style, p, 0, 0, pt, -1, transformOriginString);
					pt.b = style[p];
					pt.plugin = plugin;
					if (_supports3D) {
						copy = m1.zOrigin;
						orig = orig.split(" ");
						m1.zOrigin = ((orig.length > 2 && !(copy !== 0 && orig[2] === "0px")) ? parseFloat(orig[2]) : copy) || 0; //Safari doesn't handle the z part of transformOrigin correctly, so we'll manually handle it in the _set3DTransformRatio() method.
						pt.xs0 = pt.e = orig[0] + " " + (orig[1] || "50%") + " 0px"; //we must define a z value of 0px specifically otherwise iOS 5 Safari will stick with the old one (if one was defined)!
						pt = new CSSPropTween(m1, "zOrigin", 0, 0, pt, -1, pt.n); //we must create a CSSPropTween for the _gsTransform.zOrigin so that it gets reset properly at the beginning if the tween runs backward (as opposed to just setting m1.zOrigin here)
						pt.b = copy;
						pt.xs0 = pt.e = m1.zOrigin;
					} else {
						pt.xs0 = pt.e = orig;
					}

					//for older versions of IE (6-8), we need to manually calculate things inside the setRatio() function. We record origin x and y (ox and oy) and whether or not the values are percentages (oxp and oyp).
				} else {
					_parsePosition(orig + "", m1);
				}
			}
			if (hasChange) {
				cssp._transformType = (!(m1.svg && _useSVGTransformAttr) && (has3D || this._transformType === 3)) ? 3 : 2; //quicker than calling cssp._enableTransforms();
			}
			return pt;
		}, prefix:true});

		_registerComplexSpecialProp("boxShadow", {defaultValue:"0px 0px 0px 0px #999", prefix:true, color:true, multi:true, keyword:"inset"});

		_registerComplexSpecialProp("borderRadius", {defaultValue:"0px", parser:function(t, e, p, cssp, pt, plugin) {
			e = this.format(e);
			var props = ["borderTopLeftRadius","borderTopRightRadius","borderBottomRightRadius","borderBottomLeftRadius"],
				style = t.style,
				ea1, i, es2, bs2, bs, es, bn, en, w, h, esfx, bsfx, rel, hn, vn, em;
			w = parseFloat(t.offsetWidth);
			h = parseFloat(t.offsetHeight);
			ea1 = e.split(" ");
			for (i = 0; i < props.length; i++) { //if we're dealing with percentages, we must convert things separately for the horizontal and vertical axis!
				if (this.p.indexOf("border")) { //older browsers used a prefix
					props[i] = _checkPropPrefix(props[i]);
				}
				bs = bs2 = _getStyle(t, props[i], _cs, false, "0px");
				if (bs.indexOf(" ") !== -1) {
					bs2 = bs.split(" ");
					bs = bs2[0];
					bs2 = bs2[1];
				}
				es = es2 = ea1[i];
				bn = parseFloat(bs);
				bsfx = bs.substr((bn + "").length);
				rel = (es.charAt(1) === "=");
				if (rel) {
					en = parseInt(es.charAt(0)+"1", 10);
					es = es.substr(2);
					en *= parseFloat(es);
					esfx = es.substr((en + "").length - (en < 0 ? 1 : 0)) || "";
				} else {
					en = parseFloat(es);
					esfx = es.substr((en + "").length);
				}
				if (esfx === "") {
					esfx = _suffixMap[p] || bsfx;
				}
				if (esfx !== bsfx) {
					hn = _convertToPixels(t, "borderLeft", bn, bsfx); //horizontal number (we use a bogus "borderLeft" property just because the _convertToPixels() method searches for the keywords "Left", "Right", "Top", and "Bottom" to determine of it's a horizontal or vertical property, and we need "border" in the name so that it knows it should measure relative to the element itself, not its parent.
					vn = _convertToPixels(t, "borderTop", bn, bsfx); //vertical number
					if (esfx === "%") {
						bs = (hn / w * 100) + "%";
						bs2 = (vn / h * 100) + "%";
					} else if (esfx === "em") {
						em = _convertToPixels(t, "borderLeft", 1, "em");
						bs = (hn / em) + "em";
						bs2 = (vn / em) + "em";
					} else {
						bs = hn + "px";
						bs2 = vn + "px";
					}
					if (rel) {
						es = (parseFloat(bs) + en) + esfx;
						es2 = (parseFloat(bs2) + en) + esfx;
					}
				}
				pt = _parseComplex(style, props[i], bs + " " + bs2, es + " " + es2, false, "0px", pt);
			}
			return pt;
		}, prefix:true, formatter:_getFormatter("0px 0px 0px 0px", false, true)});
		_registerComplexSpecialProp("backgroundPosition", {defaultValue:"0 0", parser:function(t, e, p, cssp, pt, plugin) {
			var bp = "background-position",
				cs = (_cs || _getComputedStyle(t, null)),
				bs = this.format( ((cs) ? _ieVers ? cs.getPropertyValue(bp + "-x") + " " + cs.getPropertyValue(bp + "-y") : cs.getPropertyValue(bp) : t.currentStyle.backgroundPositionX + " " + t.currentStyle.backgroundPositionY) || "0 0"), //Internet Explorer doesn't report background-position correctly - we must query background-position-x and background-position-y and combine them (even in IE10). Before IE9, we must do the same with the currentStyle object and use camelCase
				es = this.format(e),
				ba, ea, i, pct, overlap, src;
			if ((bs.indexOf("%") !== -1) !== (es.indexOf("%") !== -1)) {
				src = _getStyle(t, "backgroundImage").replace(_urlExp, "");
				if (src && src !== "none") {
					ba = bs.split(" ");
					ea = es.split(" ");
					_tempImg.setAttribute("src", src); //set the temp IMG's src to the background-image so that we can measure its width/height
					i = 2;
					while (--i > -1) {
						bs = ba[i];
						pct = (bs.indexOf("%") !== -1);
						if (pct !== (ea[i].indexOf("%") !== -1)) {
							overlap = (i === 0) ? t.offsetWidth - _tempImg.width : t.offsetHeight - _tempImg.height;
							ba[i] = pct ? (parseFloat(bs) / 100 * overlap) + "px" : (parseFloat(bs) / overlap * 100) + "%";
						}
					}
					bs = ba.join(" ");
				}
			}
			return this.parseComplex(t.style, bs, es, pt, plugin);
		}, formatter:_parsePosition});
		_registerComplexSpecialProp("backgroundSize", {defaultValue:"0 0", formatter:_parsePosition});
		_registerComplexSpecialProp("perspective", {defaultValue:"0px", prefix:true});
		_registerComplexSpecialProp("perspectiveOrigin", {defaultValue:"50% 50%", prefix:true});
		_registerComplexSpecialProp("transformStyle", {prefix:true});
		_registerComplexSpecialProp("backfaceVisibility", {prefix:true});
		_registerComplexSpecialProp("userSelect", {prefix:true});
		_registerComplexSpecialProp("margin", {parser:_getEdgeParser("marginTop,marginRight,marginBottom,marginLeft")});
		_registerComplexSpecialProp("padding", {parser:_getEdgeParser("paddingTop,paddingRight,paddingBottom,paddingLeft")});
		_registerComplexSpecialProp("clip", {defaultValue:"rect(0px,0px,0px,0px)", parser:function(t, e, p, cssp, pt, plugin){
			var b, cs, delim;
			if (_ieVers < 9) { //IE8 and earlier don't report a "clip" value in the currentStyle - instead, the values are split apart into clipTop, clipRight, clipBottom, and clipLeft. Also, in IE7 and earlier, the values inside rect() are space-delimited, not comma-delimited.
				cs = t.currentStyle;
				delim = _ieVers < 8 ? " " : ",";
				b = "rect(" + cs.clipTop + delim + cs.clipRight + delim + cs.clipBottom + delim + cs.clipLeft + ")";
				e = this.format(e).split(",").join(delim);
			} else {
				b = this.format(_getStyle(t, this.p, _cs, false, this.dflt));
				e = this.format(e);
			}
			return this.parseComplex(t.style, b, e, pt, plugin);
		}});
		_registerComplexSpecialProp("textShadow", {defaultValue:"0px 0px 0px #999", color:true, multi:true});
		_registerComplexSpecialProp("autoRound,strictUnits", {parser:function(t, e, p, cssp, pt) {return pt;}}); //just so that we can ignore these properties (not tween them)
		_registerComplexSpecialProp("border", {defaultValue:"0px solid #000", parser:function(t, e, p, cssp, pt, plugin) {
				return this.parseComplex(t.style, this.format(_getStyle(t, "borderTopWidth", _cs, false, "0px") + " " + _getStyle(t, "borderTopStyle", _cs, false, "solid") + " " + _getStyle(t, "borderTopColor", _cs, false, "#000")), this.format(e), pt, plugin);
			}, color:true, formatter:function(v) {
				var a = v.split(" ");
				return a[0] + " " + (a[1] || "solid") + " " + (v.match(_colorExp) || ["#000"])[0];
			}});
		_registerComplexSpecialProp("borderWidth", {parser:_getEdgeParser("borderTopWidth,borderRightWidth,borderBottomWidth,borderLeftWidth")}); //Firefox doesn't pick up on borderWidth set in style sheets (only inline).
		_registerComplexSpecialProp("float,cssFloat,styleFloat", {parser:function(t, e, p, cssp, pt, plugin) {
			var s = t.style,
				prop = ("cssFloat" in s) ? "cssFloat" : "styleFloat";
			return new CSSPropTween(s, prop, 0, 0, pt, -1, p, false, 0, s[prop], e);
		}});

		//opacity-related
		var _setIEOpacityRatio = function(v) {
				var t = this.t, //refers to the element's style property
					filters = t.filter || _getStyle(this.data, "filter") || "",
					val = (this.s + this.c * v) | 0,
					skip;
				if (val === 100) { //for older versions of IE that need to use a filter to apply opacity, we should remove the filter if opacity hits 1 in order to improve performance, but make sure there isn't a transform (matrix) or gradient in the filters.
					if (filters.indexOf("atrix(") === -1 && filters.indexOf("radient(") === -1 && filters.indexOf("oader(") === -1) {
						t.removeAttribute("filter");
						skip = (!_getStyle(this.data, "filter")); //if a class is applied that has an alpha filter, it will take effect (we don't want that), so re-apply our alpha filter in that case. We must first remove it and then check.
					} else {
						t.filter = filters.replace(_alphaFilterExp, "");
						skip = true;
					}
				}
				if (!skip) {
					if (this.xn1) {
						t.filter = filters = filters || ("alpha(opacity=" + val + ")"); //works around bug in IE7/8 that prevents changes to "visibility" from being applied properly if the filter is changed to a different alpha on the same frame.
					}
					if (filters.indexOf("pacity") === -1) { //only used if browser doesn't support the standard opacity style property (IE 7 and 8). We omit the "O" to avoid case-sensitivity issues
						if (val !== 0 || !this.xn1) { //bugs in IE7/8 won't render the filter properly if opacity is ADDED on the same frame/render as "visibility" changes (this.xn1 is 1 if this tween is an "autoAlpha" tween)
							t.filter = filters + " alpha(opacity=" + val + ")"; //we round the value because otherwise, bugs in IE7/8 can prevent "visibility" changes from being applied properly.
						}
					} else {
						t.filter = filters.replace(_opacityExp, "opacity=" + val);
					}
				}
			};
		_registerComplexSpecialProp("opacity,alpha,autoAlpha", {defaultValue:"1", parser:function(t, e, p, cssp, pt, plugin) {
			var b = parseFloat(_getStyle(t, "opacity", _cs, false, "1")),
				style = t.style,
				isAutoAlpha = (p === "autoAlpha");
			if (typeof(e) === "string" && e.charAt(1) === "=") {
				e = ((e.charAt(0) === "-") ? -1 : 1) * parseFloat(e.substr(2)) + b;
			}
			if (isAutoAlpha && b === 1 && _getStyle(t, "visibility", _cs) === "hidden" && e !== 0) { //if visibility is initially set to "hidden", we should interpret that as intent to make opacity 0 (a convenience)
				b = 0;
			}
			if (_supportsOpacity) {
				pt = new CSSPropTween(style, "opacity", b, e - b, pt);
			} else {
				pt = new CSSPropTween(style, "opacity", b * 100, (e - b) * 100, pt);
				pt.xn1 = isAutoAlpha ? 1 : 0; //we need to record whether or not this is an autoAlpha so that in the setRatio(), we know to duplicate the setting of the alpha in order to work around a bug in IE7 and IE8 that prevents changes to "visibility" from taking effect if the filter is changed to a different alpha(opacity) at the same time. Setting it to the SAME value first, then the new value works around the IE7/8 bug.
				style.zoom = 1; //helps correct an IE issue.
				pt.type = 2;
				pt.b = "alpha(opacity=" + pt.s + ")";
				pt.e = "alpha(opacity=" + (pt.s + pt.c) + ")";
				pt.data = t;
				pt.plugin = plugin;
				pt.setRatio = _setIEOpacityRatio;
			}
			if (isAutoAlpha) { //we have to create the "visibility" PropTween after the opacity one in the linked list so that they run in the order that works properly in IE8 and earlier
				pt = new CSSPropTween(style, "visibility", 0, 0, pt, -1, null, false, 0, ((b !== 0) ? "inherit" : "hidden"), ((e === 0) ? "hidden" : "inherit"));
				pt.xs0 = "inherit";
				cssp._overwriteProps.push(pt.n);
				cssp._overwriteProps.push(p);
			}
			return pt;
		}});


		var _removeProp = function(s, p) {
				if (p) {
					if (s.removeProperty) {
						if (p.substr(0,2) === "ms" || p.substr(0,6) === "webkit") { //Microsoft and some Webkit browsers don't conform to the standard of capitalizing the first prefix character, so we adjust so that when we prefix the caps with a dash, it's correct (otherwise it'd be "ms-transform" instead of "-ms-transform" for IE9, for example)
							p = "-" + p;
						}
						s.removeProperty(p.replace(_capsExp, "-$1").toLowerCase());
					} else { //note: old versions of IE use "removeAttribute()" instead of "removeProperty()"
						s.removeAttribute(p);
					}
				}
			},
			_setClassNameRatio = function(v) {
				this.t._gsClassPT = this;
				if (v === 1 || v === 0) {
					this.t.setAttribute("class", (v === 0) ? this.b : this.e);
					var mpt = this.data, //first MiniPropTween
						s = this.t.style;
					while (mpt) {
						if (!mpt.v) {
							_removeProp(s, mpt.p);
						} else {
							s[mpt.p] = mpt.v;
						}
						mpt = mpt._next;
					}
					if (v === 1 && this.t._gsClassPT === this) {
						this.t._gsClassPT = null;
					}
				} else if (this.t.getAttribute("class") !== this.e) {
					this.t.setAttribute("class", this.e);
				}
			};
		_registerComplexSpecialProp("className", {parser:function(t, e, p, cssp, pt, plugin, vars) {
			var b = t.getAttribute("class") || "", //don't use t.className because it doesn't work consistently on SVG elements; getAttribute("class") and setAttribute("class", value") is more reliable.
				cssText = t.style.cssText,
				difData, bs, cnpt, cnptLookup, mpt;
			pt = cssp._classNamePT = new CSSPropTween(t, p, 0, 0, pt, 2);
			pt.setRatio = _setClassNameRatio;
			pt.pr = -11;
			_hasPriority = true;
			pt.b = b;
			bs = _getAllStyles(t, _cs);
			//if there's a className tween already operating on the target, force it to its end so that the necessary inline styles are removed and the class name is applied before we determine the end state (we don't want inline styles interfering that were there just for class-specific values)
			cnpt = t._gsClassPT;
			if (cnpt) {
				cnptLookup = {};
				mpt = cnpt.data; //first MiniPropTween which stores the inline styles - we need to force these so that the inline styles don't contaminate things. Otherwise, there's a small chance that a tween could start and the inline values match the destination values and they never get cleaned.
				while (mpt) {
					cnptLookup[mpt.p] = 1;
					mpt = mpt._next;
				}
				cnpt.setRatio(1);
			}
			t._gsClassPT = pt;
			pt.e = (e.charAt(1) !== "=") ? e : b.replace(new RegExp("\\s*\\b" + e.substr(2) + "\\b"), "") + ((e.charAt(0) === "+") ? " " + e.substr(2) : "");
			t.setAttribute("class", pt.e);
			difData = _cssDif(t, bs, _getAllStyles(t), vars, cnptLookup);
			t.setAttribute("class", b);
			pt.data = difData.firstMPT;
			t.style.cssText = cssText; //we recorded cssText before we swapped classes and ran _getAllStyles() because in cases when a className tween is overwritten, we remove all the related tweening properties from that class change (otherwise class-specific stuff can't override properties we've directly set on the target's style object due to specificity).
			pt = pt.xfirst = cssp.parse(t, difData.difs, pt, plugin); //we record the CSSPropTween as the xfirst so that we can handle overwriting propertly (if "className" gets overwritten, we must kill all the properties associated with the className part of the tween, so we can loop through from xfirst to the pt itself)
			return pt;
		}});


		var _setClearPropsRatio = function(v) {
			if (v === 1 || v === 0) if (this.data._totalTime === this.data._totalDuration && this.data.data !== "isFromStart") { //this.data refers to the tween. Only clear at the END of the tween (remember, from() tweens make the ratio go from 1 to 0, so we can't just check that and if the tween is the zero-duration one that's created internally to render the starting values in a from() tween, ignore that because otherwise, for example, from(...{height:100, clearProps:"height", delay:1}) would wipe the height at the beginning of the tween and after 1 second, it'd kick back in).
				var s = this.t.style,
					transformParse = _specialProps.transform.parse,
					a, p, i, clearTransform, transform;
				if (this.e === "all") {
					s.cssText = "";
					clearTransform = true;
				} else {
					a = this.e.split(" ").join("").split(",");
					i = a.length;
					while (--i > -1) {
						p = a[i];
						if (_specialProps[p]) {
							if (_specialProps[p].parse === transformParse) {
								clearTransform = true;
							} else {
								p = (p === "transformOrigin") ? _transformOriginProp : _specialProps[p].p; //ensures that special properties use the proper browser-specific property name, like "scaleX" might be "-webkit-transform" or "boxShadow" might be "-moz-box-shadow"
							}
						}
						_removeProp(s, p);
					}
				}
				if (clearTransform) {
					_removeProp(s, _transformProp);
					transform = this.t._gsTransform;
					if (transform) {
						if (transform.svg) {
							this.t.removeAttribute("data-svg-origin");
						}
						delete this.t._gsTransform;
					}
				}

			}
		};
		_registerComplexSpecialProp("clearProps", {parser:function(t, e, p, cssp, pt) {
			pt = new CSSPropTween(t, p, 0, 0, pt, 2);
			pt.setRatio = _setClearPropsRatio;
			pt.e = e;
			pt.pr = -10;
			pt.data = cssp._tween;
			_hasPriority = true;
			return pt;
		}});

		p = "bezier,throwProps,physicsProps,physics2D".split(",");
		i = p.length;
		while (i--) {
			_registerPluginProp(p[i]);
		}








		p = CSSPlugin.prototype;
		p._firstPT = p._lastParsedTransform = p._transform = null;

		//gets called when the tween renders for the first time. This kicks everything off, recording start/end values, etc.
		p._onInitTween = function(target, vars, tween) {
			if (!target.nodeType) { //css is only for dom elements
				return false;
			}
			this._target = target;
			this._tween = tween;
			this._vars = vars;
			_autoRound = vars.autoRound;
			_hasPriority = false;
			_suffixMap = vars.suffixMap || CSSPlugin.suffixMap;
			_cs = _getComputedStyle(target, "");
			_overwriteProps = this._overwriteProps;
			var style = target.style,
				v, pt, pt2, first, last, next, zIndex, tpt, threeD;
			if (_reqSafariFix) if (style.zIndex === "") {
				v = _getStyle(target, "zIndex", _cs);
				if (v === "auto" || v === "") {
					//corrects a bug in [non-Android] Safari that prevents it from repainting elements in their new positions if they don't have a zIndex set. We also can't just apply this inside _parseTransform() because anything that's moved in any way (like using "left" or "top" instead of transforms like "x" and "y") can be affected, so it is best to ensure that anything that's tweening has a z-index. Setting "WebkitPerspective" to a non-zero value worked too except that on iOS Safari things would flicker randomly. Plus zIndex is less memory-intensive.
					this._addLazySet(style, "zIndex", 0);
				}
			}

			if (typeof(vars) === "string") {
				first = style.cssText;
				v = _getAllStyles(target, _cs);
				style.cssText = first + ";" + vars;
				v = _cssDif(target, v, _getAllStyles(target)).difs;
				if (!_supportsOpacity && _opacityValExp.test(vars)) {
					v.opacity = parseFloat( RegExp.$1 );
				}
				vars = v;
				style.cssText = first;
			}

			if (vars.className) { //className tweens will combine any differences they find in the css with the vars that are passed in, so {className:"myClass", scale:0.5, left:20} would work.
				this._firstPT = pt = _specialProps.className.parse(target, vars.className, "className", this, null, null, vars);
			} else {
				this._firstPT = pt = this.parse(target, vars, null);
			}

			if (this._transformType) {
				threeD = (this._transformType === 3);
				if (!_transformProp) {
					style.zoom = 1; //helps correct an IE issue.
				} else if (_isSafari) {
					_reqSafariFix = true;
					//if zIndex isn't set, iOS Safari doesn't repaint things correctly sometimes (seemingly at random).
					if (style.zIndex === "") {
						zIndex = _getStyle(target, "zIndex", _cs);
						if (zIndex === "auto" || zIndex === "") {
							this._addLazySet(style, "zIndex", 0);
						}
					}
					//Setting WebkitBackfaceVisibility corrects 3 bugs:
					// 1) [non-Android] Safari skips rendering changes to "top" and "left" that are made on the same frame/render as a transform update.
					// 2) iOS Safari sometimes neglects to repaint elements in their new positions. Setting "WebkitPerspective" to a non-zero value worked too except that on iOS Safari things would flicker randomly.
					// 3) Safari sometimes displayed odd artifacts when tweening the transform (or WebkitTransform) property, like ghosts of the edges of the element remained. Definitely a browser bug.
					//Note: we allow the user to override the auto-setting by defining WebkitBackfaceVisibility in the vars of the tween.
					if (_isSafariLT6) {
						this._addLazySet(style, "WebkitBackfaceVisibility", this._vars.WebkitBackfaceVisibility || (threeD ? "visible" : "hidden"));
					}
				}
				pt2 = pt;
				while (pt2 && pt2._next) {
					pt2 = pt2._next;
				}
				tpt = new CSSPropTween(target, "transform", 0, 0, null, 2);
				this._linkCSSP(tpt, null, pt2);
				tpt.setRatio = _transformProp ? _setTransformRatio : _setIETransformRatio;
				tpt.data = this._transform || _getTransform(target, _cs, true);
				tpt.tween = tween;
				tpt.pr = -1; //ensures that the transforms get applied after the components are updated.
				_overwriteProps.pop(); //we don't want to force the overwrite of all "transform" tweens of the target - we only care about individual transform properties like scaleX, rotation, etc. The CSSPropTween constructor automatically adds the property to _overwriteProps which is why we need to pop() here.
			}

			if (_hasPriority) {
				//reorders the linked list in order of pr (priority)
				while (pt) {
					next = pt._next;
					pt2 = first;
					while (pt2 && pt2.pr > pt.pr) {
						pt2 = pt2._next;
					}
					if ((pt._prev = pt2 ? pt2._prev : last)) {
						pt._prev._next = pt;
					} else {
						first = pt;
					}
					if ((pt._next = pt2)) {
						pt2._prev = pt;
					} else {
						last = pt;
					}
					pt = next;
				}
				this._firstPT = first;
			}
			return true;
		};


		p.parse = function(target, vars, pt, plugin) {
			var style = target.style,
				p, sp, bn, en, bs, es, bsfx, esfx, isStr, rel;
			for (p in vars) {
				es = vars[p]; //ending value string
				sp = _specialProps[p]; //SpecialProp lookup.
				if (sp) {
					pt = sp.parse(target, es, p, this, pt, plugin, vars);

				} else {
					bs = _getStyle(target, p, _cs) + "";
					isStr = (typeof(es) === "string");
					if (p === "color" || p === "fill" || p === "stroke" || p.indexOf("Color") !== -1 || (isStr && _rgbhslExp.test(es))) { //Opera uses background: to define color sometimes in addition to backgroundColor:
						if (!isStr) {
							es = _parseColor(es);
							es = ((es.length > 3) ? "rgba(" : "rgb(") + es.join(",") + ")";
						}
						pt = _parseComplex(style, p, bs, es, true, "transparent", pt, 0, plugin);

					} else if (isStr && (es.indexOf(" ") !== -1 || es.indexOf(",") !== -1)) {
						pt = _parseComplex(style, p, bs, es, true, null, pt, 0, plugin);

					} else {
						bn = parseFloat(bs);
						bsfx = (bn || bn === 0) ? bs.substr((bn + "").length) : ""; //remember, bs could be non-numeric like "normal" for fontWeight, so we should default to a blank suffix in that case.

						if (bs === "" || bs === "auto") {
							if (p === "width" || p === "height") {
								bn = _getDimension(target, p, _cs);
								bsfx = "px";
							} else if (p === "left" || p === "top") {
								bn = _calculateOffset(target, p, _cs);
								bsfx = "px";
							} else {
								bn = (p !== "opacity") ? 0 : 1;
								bsfx = "";
							}
						}

						rel = (isStr && es.charAt(1) === "=");
						if (rel) {
							en = parseInt(es.charAt(0) + "1", 10);
							es = es.substr(2);
							en *= parseFloat(es);
							esfx = es.replace(_suffixExp, "");
						} else {
							en = parseFloat(es);
							esfx = isStr ? es.replace(_suffixExp, "") : "";
						}

						if (esfx === "") {
							esfx = (p in _suffixMap) ? _suffixMap[p] : bsfx; //populate the end suffix, prioritizing the map, then if none is found, use the beginning suffix.
						}

						es = (en || en === 0) ? (rel ? en + bn : en) + esfx : vars[p]; //ensures that any += or -= prefixes are taken care of. Record the end value before normalizing the suffix because we always want to end the tween on exactly what they intended even if it doesn't match the beginning value's suffix.

						//if the beginning/ending suffixes don't match, normalize them...
						if (bsfx !== esfx) if (esfx !== "") if (en || en === 0) if (bn) { //note: if the beginning value (bn) is 0, we don't need to convert units!
							bn = _convertToPixels(target, p, bn, bsfx);
							if (esfx === "%") {
								bn /= _convertToPixels(target, p, 100, "%") / 100;
								if (vars.strictUnits !== true) { //some browsers report only "px" values instead of allowing "%" with getComputedStyle(), so we assume that if we're tweening to a %, we should start there too unless strictUnits:true is defined. This approach is particularly useful for responsive designs that use from() tweens.
									bs = bn + "%";
								}

							} else if (esfx === "em" || esfx === "rem") {
								bn /= _convertToPixels(target, p, 1, esfx);

							//otherwise convert to pixels.
							} else if (esfx !== "px") {
								en = _convertToPixels(target, p, en, esfx);
								esfx = "px"; //we don't use bsfx after this, so we don't need to set it to px too.
							}
							if (rel) if (en || en === 0) {
								es = (en + bn) + esfx; //the changes we made affect relative calculations, so adjust the end value here.
							}
						}

						if (rel) {
							en += bn;
						}

						if ((bn || bn === 0) && (en || en === 0)) { //faster than isNaN(). Also, previously we required en !== bn but that doesn't really gain much performance and it prevents _parseToProxy() from working properly if beginning and ending values match but need to get tweened by an external plugin anyway. For example, a bezier tween where the target starts at left:0 and has these points: [{left:50},{left:0}] wouldn't work properly because when parsing the last point, it'd match the first (current) one and a non-tweening CSSPropTween would be recorded when we actually need a normal tween (type:0) so that things get updated during the tween properly.
							pt = new CSSPropTween(style, p, bn, en - bn, pt, 0, p, (_autoRound !== false && (esfx === "px" || p === "zIndex")), 0, bs, es);
							pt.xs0 = esfx;
							//DEBUG: _log("tween "+p+" from "+pt.b+" ("+bn+esfx+") to "+pt.e+" with suffix: "+pt.xs0);
						} else if (style[p] === undefined || !es && (es + "" === "NaN" || es == null)) {
							_log("invalid " + p + " tween value: " + vars[p]);
						} else {
							pt = new CSSPropTween(style, p, en || bn || 0, 0, pt, -1, p, false, 0, bs, es);
							pt.xs0 = (es === "none" && (p === "display" || p.indexOf("Style") !== -1)) ? bs : es; //intermediate value should typically be set immediately (end value) except for "display" or things like borderTopStyle, borderBottomStyle, etc. which should use the beginning value during the tween.
							//DEBUG: _log("non-tweening value "+p+": "+pt.xs0);
						}
					}
				}
				if (plugin) if (pt && !pt.plugin) {
					pt.plugin = plugin;
				}
			}
			return pt;
		};


		//gets called every time the tween updates, passing the new ratio (typically a value between 0 and 1, but not always (for example, if an Elastic.easeOut is used, the value can jump above 1 mid-tween). It will always start and 0 and end at 1.
		p.setRatio = function(v) {
			var pt = this._firstPT,
				min = 0.000001,
				val, str, i;
			//at the end of the tween, we set the values to exactly what we received in order to make sure non-tweening values (like "position" or "float" or whatever) are set and so that if the beginning/ending suffixes (units) didn't match and we normalized to px, the value that the user passed in is used here. We check to see if the tween is at its beginning in case it's a from() tween in which case the ratio will actually go from 1 to 0 over the course of the tween (backwards).
			if (v === 1 && (this._tween._time === this._tween._duration || this._tween._time === 0)) {
				while (pt) {
					if (pt.type !== 2) {
						if (pt.r && pt.type !== -1) {
							val = Math.round(pt.s + pt.c);
							if (!pt.type) {
								pt.t[pt.p] = val + pt.xs0;
							} else if (pt.type === 1) { //complex value (one that typically has multiple numbers inside a string, like "rect(5px,10px,20px,25px)"
								i = pt.l;
								str = pt.xs0 + val + pt.xs1;
								for (i = 1; i < pt.l; i++) {
									str += pt["xn"+i] + pt["xs"+(i+1)];
								}
								pt.t[pt.p] = str;
							}
						} else {
							pt.t[pt.p] = pt.e;
						}
					} else {
						pt.setRatio(v);
					}
					pt = pt._next;
				}

			} else if (v || !(this._tween._time === this._tween._duration || this._tween._time === 0) || this._tween._rawPrevTime === -0.000001) {
				while (pt) {
					val = pt.c * v + pt.s;
					if (pt.r) {
						val = Math.round(val);
					} else if (val < min) if (val > -min) {
						val = 0;
					}
					if (!pt.type) {
						pt.t[pt.p] = val + pt.xs0;
					} else if (pt.type === 1) { //complex value (one that typically has multiple numbers inside a string, like "rect(5px,10px,20px,25px)"
						i = pt.l;
						if (i === 2) {
							pt.t[pt.p] = pt.xs0 + val + pt.xs1 + pt.xn1 + pt.xs2;
						} else if (i === 3) {
							pt.t[pt.p] = pt.xs0 + val + pt.xs1 + pt.xn1 + pt.xs2 + pt.xn2 + pt.xs3;
						} else if (i === 4) {
							pt.t[pt.p] = pt.xs0 + val + pt.xs1 + pt.xn1 + pt.xs2 + pt.xn2 + pt.xs3 + pt.xn3 + pt.xs4;
						} else if (i === 5) {
							pt.t[pt.p] = pt.xs0 + val + pt.xs1 + pt.xn1 + pt.xs2 + pt.xn2 + pt.xs3 + pt.xn3 + pt.xs4 + pt.xn4 + pt.xs5;
						} else {
							str = pt.xs0 + val + pt.xs1;
							for (i = 1; i < pt.l; i++) {
								str += pt["xn"+i] + pt["xs"+(i+1)];
							}
							pt.t[pt.p] = str;
						}

					} else if (pt.type === -1) { //non-tweening value
						pt.t[pt.p] = pt.xs0;

					} else if (pt.setRatio) { //custom setRatio() for things like SpecialProps, external plugins, etc.
						pt.setRatio(v);
					}
					pt = pt._next;
				}

			//if the tween is reversed all the way back to the beginning, we need to restore the original values which may have different units (like % instead of px or em or whatever).
			} else {
				while (pt) {
					if (pt.type !== 2) {
						pt.t[pt.p] = pt.b;
					} else {
						pt.setRatio(v);
					}
					pt = pt._next;
				}
			}
		};

		/**
		 * @private
		 * Forces rendering of the target's transforms (rotation, scale, etc.) whenever the CSSPlugin's setRatio() is called.
		 * Basically, this tells the CSSPlugin to create a CSSPropTween (type 2) after instantiation that runs last in the linked
		 * list and calls the appropriate (3D or 2D) rendering function. We separate this into its own method so that we can call
		 * it from other plugins like BezierPlugin if, for example, it needs to apply an autoRotation and this CSSPlugin
		 * doesn't have any transform-related properties of its own. You can call this method as many times as you
		 * want and it won't create duplicate CSSPropTweens.
		 *
		 * @param {boolean} threeD if true, it should apply 3D tweens (otherwise, just 2D ones are fine and typically faster)
		 */
		p._enableTransforms = function(threeD) {
			this._transform = this._transform || _getTransform(this._target, _cs, true); //ensures that the element has a _gsTransform property with the appropriate values.
			this._transformType = (!(this._transform.svg && _useSVGTransformAttr) && (threeD || this._transformType === 3)) ? 3 : 2;
		};

		var lazySet = function(v) {
			this.t[this.p] = this.e;
			this.data._linkCSSP(this, this._next, null, true); //we purposefully keep this._next even though it'd make sense to null it, but this is a performance optimization, as this happens during the while (pt) {} loop in setRatio() at the bottom of which it sets pt = pt._next, so if we null it, the linked list will be broken in that loop.
		};
		/** @private Gives us a way to set a value on the first render (and only the first render). **/
		p._addLazySet = function(t, p, v) {
			var pt = this._firstPT = new CSSPropTween(t, p, 0, 0, this._firstPT, 2);
			pt.e = v;
			pt.setRatio = lazySet;
			pt.data = this;
		};

		/** @private **/
		p._linkCSSP = function(pt, next, prev, remove) {
			if (pt) {
				if (next) {
					next._prev = pt;
				}
				if (pt._next) {
					pt._next._prev = pt._prev;
				}
				if (pt._prev) {
					pt._prev._next = pt._next;
				} else if (this._firstPT === pt) {
					this._firstPT = pt._next;
					remove = true; //just to prevent resetting this._firstPT 5 lines down in case pt._next is null. (optimized for speed)
				}
				if (prev) {
					prev._next = pt;
				} else if (!remove && this._firstPT === null) {
					this._firstPT = pt;
				}
				pt._next = next;
				pt._prev = prev;
			}
			return pt;
		};

		//we need to make sure that if alpha or autoAlpha is killed, opacity is too. And autoAlpha affects the "visibility" property.
		p._kill = function(lookup) {
			var copy = lookup,
				pt, p, xfirst;
			if (lookup.autoAlpha || lookup.alpha) {
				copy = {};
				for (p in lookup) { //copy the lookup so that we're not changing the original which may be passed elsewhere.
					copy[p] = lookup[p];
				}
				copy.opacity = 1;
				if (copy.autoAlpha) {
					copy.visibility = 1;
				}
			}
			if (lookup.className && (pt = this._classNamePT)) { //for className tweens, we need to kill any associated CSSPropTweens too; a linked list starts at the className's "xfirst".
				xfirst = pt.xfirst;
				if (xfirst && xfirst._prev) {
					this._linkCSSP(xfirst._prev, pt._next, xfirst._prev._prev); //break off the prev
				} else if (xfirst === this._firstPT) {
					this._firstPT = pt._next;
				}
				if (pt._next) {
					this._linkCSSP(pt._next, pt._next._next, xfirst._prev);
				}
				this._classNamePT = null;
			}
			return TweenPlugin.prototype._kill.call(this, copy);
		};



		//used by cascadeTo() for gathering all the style properties of each child element into an array for comparison.
		var _getChildStyles = function(e, props, targets) {
				var children, i, child, type;
				if (e.slice) {
					i = e.length;
					while (--i > -1) {
						_getChildStyles(e[i], props, targets);
					}
					return;
				}
				children = e.childNodes;
				i = children.length;
				while (--i > -1) {
					child = children[i];
					type = child.type;
					if (child.style) {
						props.push(_getAllStyles(child));
						if (targets) {
							targets.push(child);
						}
					}
					if ((type === 1 || type === 9 || type === 11) && child.childNodes.length) {
						_getChildStyles(child, props, targets);
					}
				}
			};

		/**
		 * Typically only useful for className tweens that may affect child elements, this method creates a TweenLite
		 * and then compares the style properties of all the target's child elements at the tween's start and end, and
		 * if any are different, it also creates tweens for those and returns an array containing ALL of the resulting
		 * tweens (so that you can easily add() them to a TimelineLite, for example). The reason this functionality is
		 * wrapped into a separate static method of CSSPlugin instead of being integrated into all regular className tweens
		 * is because it creates entirely new tweens that may have completely different targets than the original tween,
		 * so if they were all lumped into the original tween instance, it would be inconsistent with the rest of the API
		 * and it would create other problems. For example:
		 *  - If I create a tween of elementA, that tween instance may suddenly change its target to include 50 other elements (unintuitive if I specifically defined the target I wanted)
		 *  - We can't just create new independent tweens because otherwise, what happens if the original/parent tween is reversed or pause or dropped into a TimelineLite for tight control? You'd expect that tween's behavior to affect all the others.
		 *  - Analyzing every style property of every child before and after the tween is an expensive operation when there are many children, so this behavior shouldn't be imposed on all className tweens by default, especially since it's probably rare that this extra functionality is needed.
		 *
		 * @param {Object} target object to be tweened
		 * @param {number} Duration in seconds (or frames for frames-based tweens)
		 * @param {Object} Object containing the end values, like {className:"newClass", ease:Linear.easeNone}
		 * @return {Array} An array of TweenLite instances
		 */
		CSSPlugin.cascadeTo = function(target, duration, vars) {
			var tween = TweenLite.to(target, duration, vars),
				results = [tween],
				b = [],
				e = [],
				targets = [],
				_reservedProps = TweenLite._internals.reservedProps,
				i, difs, p, from;
			target = tween._targets || tween.target;
			_getChildStyles(target, b, targets);
			tween.render(duration, true, true);
			_getChildStyles(target, e);
			tween.render(0, true, true);
			tween._enabled(true);
			i = targets.length;
			while (--i > -1) {
				difs = _cssDif(targets[i], b[i], e[i]);
				if (difs.firstMPT) {
					difs = difs.difs;
					for (p in vars) {
						if (_reservedProps[p]) {
							difs[p] = vars[p];
						}
					}
					from = {};
					for (p in difs) {
						from[p] = b[i][p];
					}
					results.push(TweenLite.fromTo(targets[i], duration, from, difs));
				}
			}
			return results;
		};

		TweenPlugin.activate([CSSPlugin]);
		return CSSPlugin;

	}, true);

}); if (_gsScope._gsDefine) { _gsScope._gsQueue.pop()(); }

//export to AMD/RequireJS and CommonJS/Node (precursor to full modular build system coming at a later date)
(function(name) {
	"use strict";
	var getGlobal = function() {
		return (_gsScope.GreenSockGlobals || _gsScope)[name];
	};
	if (typeof(define) === "function" && define.amd) { //AMD
		define(["TweenLite"], getGlobal);
	} else if (typeof(module) !== "undefined" && module.exports) { //node
		module.exports = getGlobal();
	}
}("CSSPlugin"));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],2:[function(require,module,exports){
(function (global){
/*!
 * VERSION: beta 1.15.2
 * DATE: 2015-01-27
 * UPDATES AND DOCS AT: http://greensock.com
 *
 * @license Copyright (c) 2008-2015, GreenSock. All rights reserved.
 * This work is subject to the terms at http://greensock.com/standard-license or for
 * Club GreenSock members, the software agreement that was issued with your membership.
 * 
 * @author: Jack Doyle, jack@greensock.com
 **/
var _gsScope = (typeof(module) !== "undefined" && module.exports && typeof(global) !== "undefined") ? global : this || window; //helps ensure compatibility with AMD/RequireJS and CommonJS/Node
(_gsScope._gsQueue || (_gsScope._gsQueue = [])).push( function() {

	"use strict";

	_gsScope._gsDefine("easing.Back", ["easing.Ease"], function(Ease) {
		
		var w = (_gsScope.GreenSockGlobals || _gsScope),
			gs = w.com.greensock,
			_2PI = Math.PI * 2,
			_HALF_PI = Math.PI / 2,
			_class = gs._class,
			_create = function(n, f) {
				var C = _class("easing." + n, function(){}, true),
					p = C.prototype = new Ease();
				p.constructor = C;
				p.getRatio = f;
				return C;
			},
			_easeReg = Ease.register || function(){}, //put an empty function in place just as a safety measure in case someone loads an OLD version of TweenLite.js where Ease.register doesn't exist.
			_wrap = function(name, EaseOut, EaseIn, EaseInOut, aliases) {
				var C = _class("easing."+name, {
					easeOut:new EaseOut(),
					easeIn:new EaseIn(),
					easeInOut:new EaseInOut()
				}, true);
				_easeReg(C, name);
				return C;
			},
			EasePoint = function(time, value, next) {
				this.t = time;
				this.v = value;
				if (next) {
					this.next = next;
					next.prev = this;
					this.c = next.v - value;
					this.gap = next.t - time;
				}
			},

			//Back
			_createBack = function(n, f) {
				var C = _class("easing." + n, function(overshoot) {
						this._p1 = (overshoot || overshoot === 0) ? overshoot : 1.70158;
						this._p2 = this._p1 * 1.525;
					}, true), 
					p = C.prototype = new Ease();
				p.constructor = C;
				p.getRatio = f;
				p.config = function(overshoot) {
					return new C(overshoot);
				};
				return C;
			},

			Back = _wrap("Back",
				_createBack("BackOut", function(p) {
					return ((p = p - 1) * p * ((this._p1 + 1) * p + this._p1) + 1);
				}),
				_createBack("BackIn", function(p) {
					return p * p * ((this._p1 + 1) * p - this._p1);
				}),
				_createBack("BackInOut", function(p) {
					return ((p *= 2) < 1) ? 0.5 * p * p * ((this._p2 + 1) * p - this._p2) : 0.5 * ((p -= 2) * p * ((this._p2 + 1) * p + this._p2) + 2);
				})
			),


			//SlowMo
			SlowMo = _class("easing.SlowMo", function(linearRatio, power, yoyoMode) {
				power = (power || power === 0) ? power : 0.7;
				if (linearRatio == null) {
					linearRatio = 0.7;
				} else if (linearRatio > 1) {
					linearRatio = 1;
				}
				this._p = (linearRatio !== 1) ? power : 0;
				this._p1 = (1 - linearRatio) / 2;
				this._p2 = linearRatio;
				this._p3 = this._p1 + this._p2;
				this._calcEnd = (yoyoMode === true);
			}, true),
			p = SlowMo.prototype = new Ease(),
			SteppedEase, RoughEase, _createElastic;
			
		p.constructor = SlowMo;
		p.getRatio = function(p) {
			var r = p + (0.5 - p) * this._p;
			if (p < this._p1) {
				return this._calcEnd ? 1 - ((p = 1 - (p / this._p1)) * p) : r - ((p = 1 - (p / this._p1)) * p * p * p * r);
			} else if (p > this._p3) {
				return this._calcEnd ? 1 - (p = (p - this._p3) / this._p1) * p : r + ((p - r) * (p = (p - this._p3) / this._p1) * p * p * p);
			}
			return this._calcEnd ? 1 : r;
		};
		SlowMo.ease = new SlowMo(0.7, 0.7);
		
		p.config = SlowMo.config = function(linearRatio, power, yoyoMode) {
			return new SlowMo(linearRatio, power, yoyoMode);
		};


		//SteppedEase
		SteppedEase = _class("easing.SteppedEase", function(steps) {
				steps = steps || 1;
				this._p1 = 1 / steps;
				this._p2 = steps + 1;
			}, true);
		p = SteppedEase.prototype = new Ease();	
		p.constructor = SteppedEase;
		p.getRatio = function(p) {
			if (p < 0) {
				p = 0;
			} else if (p >= 1) {
				p = 0.999999999;
			}
			return ((this._p2 * p) >> 0) * this._p1;
		};
		p.config = SteppedEase.config = function(steps) {
			return new SteppedEase(steps);
		};


		//RoughEase
		RoughEase = _class("easing.RoughEase", function(vars) {
			vars = vars || {};
			var taper = vars.taper || "none",
				a = [],
				cnt = 0,
				points = (vars.points || 20) | 0,
				i = points,
				randomize = (vars.randomize !== false),
				clamp = (vars.clamp === true),
				template = (vars.template instanceof Ease) ? vars.template : null,
				strength = (typeof(vars.strength) === "number") ? vars.strength * 0.4 : 0.4,
				x, y, bump, invX, obj, pnt;
			while (--i > -1) {
				x = randomize ? Math.random() : (1 / points) * i;
				y = template ? template.getRatio(x) : x;
				if (taper === "none") {
					bump = strength;
				} else if (taper === "out") {
					invX = 1 - x;
					bump = invX * invX * strength;
				} else if (taper === "in") {
					bump = x * x * strength;
				} else if (x < 0.5) {  //"both" (start)
					invX = x * 2;
					bump = invX * invX * 0.5 * strength;
				} else {				//"both" (end)
					invX = (1 - x) * 2;
					bump = invX * invX * 0.5 * strength;
				}
				if (randomize) {
					y += (Math.random() * bump) - (bump * 0.5);
				} else if (i % 2) {
					y += bump * 0.5;
				} else {
					y -= bump * 0.5;
				}
				if (clamp) {
					if (y > 1) {
						y = 1;
					} else if (y < 0) {
						y = 0;
					}
				}
				a[cnt++] = {x:x, y:y};
			}
			a.sort(function(a, b) {
				return a.x - b.x;
			});

			pnt = new EasePoint(1, 1, null);
			i = points;
			while (--i > -1) {
				obj = a[i];
				pnt = new EasePoint(obj.x, obj.y, pnt);
			}

			this._prev = new EasePoint(0, 0, (pnt.t !== 0) ? pnt : pnt.next);
		}, true);
		p = RoughEase.prototype = new Ease();
		p.constructor = RoughEase;
		p.getRatio = function(p) {
			var pnt = this._prev;
			if (p > pnt.t) {
				while (pnt.next && p >= pnt.t) {
					pnt = pnt.next;
				}
				pnt = pnt.prev;
			} else {
				while (pnt.prev && p <= pnt.t) {
					pnt = pnt.prev;
				}
			}
			this._prev = pnt;
			return (pnt.v + ((p - pnt.t) / pnt.gap) * pnt.c);
		};
		p.config = function(vars) {
			return new RoughEase(vars);
		};
		RoughEase.ease = new RoughEase();


		//Bounce
		_wrap("Bounce",
			_create("BounceOut", function(p) {
				if (p < 1 / 2.75) {
					return 7.5625 * p * p;
				} else if (p < 2 / 2.75) {
					return 7.5625 * (p -= 1.5 / 2.75) * p + 0.75;
				} else if (p < 2.5 / 2.75) {
					return 7.5625 * (p -= 2.25 / 2.75) * p + 0.9375;
				}
				return 7.5625 * (p -= 2.625 / 2.75) * p + 0.984375;
			}),
			_create("BounceIn", function(p) {
				if ((p = 1 - p) < 1 / 2.75) {
					return 1 - (7.5625 * p * p);
				} else if (p < 2 / 2.75) {
					return 1 - (7.5625 * (p -= 1.5 / 2.75) * p + 0.75);
				} else if (p < 2.5 / 2.75) {
					return 1 - (7.5625 * (p -= 2.25 / 2.75) * p + 0.9375);
				}
				return 1 - (7.5625 * (p -= 2.625 / 2.75) * p + 0.984375);
			}),
			_create("BounceInOut", function(p) {
				var invert = (p < 0.5);
				if (invert) {
					p = 1 - (p * 2);
				} else {
					p = (p * 2) - 1;
				}
				if (p < 1 / 2.75) {
					p = 7.5625 * p * p;
				} else if (p < 2 / 2.75) {
					p = 7.5625 * (p -= 1.5 / 2.75) * p + 0.75;
				} else if (p < 2.5 / 2.75) {
					p = 7.5625 * (p -= 2.25 / 2.75) * p + 0.9375;
				} else {
					p = 7.5625 * (p -= 2.625 / 2.75) * p + 0.984375;
				}
				return invert ? (1 - p) * 0.5 : p * 0.5 + 0.5;
			})
		);


		//CIRC
		_wrap("Circ",
			_create("CircOut", function(p) {
				return Math.sqrt(1 - (p = p - 1) * p);
			}),
			_create("CircIn", function(p) {
				return -(Math.sqrt(1 - (p * p)) - 1);
			}),
			_create("CircInOut", function(p) {
				return ((p*=2) < 1) ? -0.5 * (Math.sqrt(1 - p * p) - 1) : 0.5 * (Math.sqrt(1 - (p -= 2) * p) + 1);
			})
		);


		//Elastic
		_createElastic = function(n, f, def) {
			var C = _class("easing." + n, function(amplitude, period) {
					this._p1 = (amplitude >= 1) ? amplitude : 1; //note: if amplitude is < 1, we simply adjust the period for a more natural feel. Otherwise the math doesn't work right and the curve starts at 1.
					this._p2 = (period || def) / (amplitude < 1 ? amplitude : 1);
					this._p3 = this._p2 / _2PI * (Math.asin(1 / this._p1) || 0);
					this._p2 = _2PI / this._p2; //precalculate to optimize
				}, true),
				p = C.prototype = new Ease();
			p.constructor = C;
			p.getRatio = f;
			p.config = function(amplitude, period) {
				return new C(amplitude, period);
			};
			return C;
		};
		_wrap("Elastic",
			_createElastic("ElasticOut", function(p) {
				return this._p1 * Math.pow(2, -10 * p) * Math.sin( (p - this._p3) * this._p2 ) + 1;
			}, 0.3),
			_createElastic("ElasticIn", function(p) {
				return -(this._p1 * Math.pow(2, 10 * (p -= 1)) * Math.sin( (p - this._p3) * this._p2 ));
			}, 0.3),
			_createElastic("ElasticInOut", function(p) {
				return ((p *= 2) < 1) ? -0.5 * (this._p1 * Math.pow(2, 10 * (p -= 1)) * Math.sin( (p - this._p3) * this._p2)) : this._p1 * Math.pow(2, -10 *(p -= 1)) * Math.sin( (p - this._p3) * this._p2 ) * 0.5 + 1;
			}, 0.45)
		);


		//Expo
		_wrap("Expo",
			_create("ExpoOut", function(p) {
				return 1 - Math.pow(2, -10 * p);
			}),
			_create("ExpoIn", function(p) {
				return Math.pow(2, 10 * (p - 1)) - 0.001;
			}),
			_create("ExpoInOut", function(p) {
				return ((p *= 2) < 1) ? 0.5 * Math.pow(2, 10 * (p - 1)) : 0.5 * (2 - Math.pow(2, -10 * (p - 1)));
			})
		);


		//Sine
		_wrap("Sine",
			_create("SineOut", function(p) {
				return Math.sin(p * _HALF_PI);
			}),
			_create("SineIn", function(p) {
				return -Math.cos(p * _HALF_PI) + 1;
			}),
			_create("SineInOut", function(p) {
				return -0.5 * (Math.cos(Math.PI * p) - 1);
			})
		);

		_class("easing.EaseLookup", {
				find:function(s) {
					return Ease.map[s];
				}
			}, true);

		//register the non-standard eases
		_easeReg(w.SlowMo, "SlowMo", "ease,");
		_easeReg(RoughEase, "RoughEase", "ease,");
		_easeReg(SteppedEase, "SteppedEase", "ease,");
		
		return Back;
		
	}, true);

}); if (_gsScope._gsDefine) { _gsScope._gsQueue.pop()(); }
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],3:[function(require,module,exports){
(function (global){
/*!
 * VERSION: 1.18.0
 * DATE: 2015-08-29
 * UPDATES AND DOCS AT: http://greensock.com
 *
 * @license Copyright (c) 2008-2015, GreenSock. All rights reserved.
 * This work is subject to the terms at http://greensock.com/standard-license or for
 * Club GreenSock members, the software agreement that was issued with your membership.
 * 
 * @author: Jack Doyle, jack@greensock.com
 */
var _gsScope = (typeof(module) !== "undefined" && module.exports && typeof(global) !== "undefined") ? global : this || window; //helps ensure compatibility with AMD/RequireJS and CommonJS/Node
(_gsScope._gsQueue || (_gsScope._gsQueue = [])).push( function() {

	"use strict";

	_gsScope._gsDefine("TimelineLite", ["core.Animation","core.SimpleTimeline","TweenLite"], function(Animation, SimpleTimeline, TweenLite) {

		var TimelineLite = function(vars) {
				SimpleTimeline.call(this, vars);
				this._labels = {};
				this.autoRemoveChildren = (this.vars.autoRemoveChildren === true);
				this.smoothChildTiming = (this.vars.smoothChildTiming === true);
				this._sortChildren = true;
				this._onUpdate = this.vars.onUpdate;
				var v = this.vars,
					val, p;
				for (p in v) {
					val = v[p];
					if (_isArray(val)) if (val.join("").indexOf("{self}") !== -1) {
						v[p] = this._swapSelfInParams(val);
					}
				}
				if (_isArray(v.tweens)) {
					this.add(v.tweens, 0, v.align, v.stagger);
				}
			},
			_tinyNum = 0.0000000001,
			TweenLiteInternals = TweenLite._internals,
			_internals = TimelineLite._internals = {},
			_isSelector = TweenLiteInternals.isSelector,
			_isArray = TweenLiteInternals.isArray,
			_lazyTweens = TweenLiteInternals.lazyTweens,
			_lazyRender = TweenLiteInternals.lazyRender,
			_globals = _gsScope._gsDefine.globals,
			_copy = function(vars) {
				var copy = {}, p;
				for (p in vars) {
					copy[p] = vars[p];
				}
				return copy;
			},
			_applyCycle = function(vars, targets, i) {
				var alt = vars.cycle,
					p, val;
				for (p in alt) {
					val = alt[p];
					vars[p] = (typeof(val) === "function") ? val.call(targets[i], i) : val[i % val.length];
				}
				delete vars.cycle;
			},
			_pauseCallback = _internals.pauseCallback = function() {},
			_slice = function(a) { //don't use [].slice because that doesn't work in IE8 with a NodeList that's returned by querySelectorAll()
				var b = [],
					l = a.length,
					i;
				for (i = 0; i !== l; b.push(a[i++]));
				return b;
			},
			p = TimelineLite.prototype = new SimpleTimeline();

		TimelineLite.version = "1.18.0";
		p.constructor = TimelineLite;
		p.kill()._gc = p._forcingPlayhead = p._hasPause = false;

		/* might use later...
		//translates a local time inside an animation to the corresponding time on the root/global timeline, factoring in all nesting and timeScales.
		function localToGlobal(time, animation) {
			while (animation) {
				time = (time / animation._timeScale) + animation._startTime;
				animation = animation.timeline;
			}
			return time;
		}

		//translates the supplied time on the root/global timeline into the corresponding local time inside a particular animation, factoring in all nesting and timeScales
		function globalToLocal(time, animation) {
			var scale = 1;
			time -= localToGlobal(0, animation);
			while (animation) {
				scale *= animation._timeScale;
				animation = animation.timeline;
			}
			return time * scale;
		}
		*/

		p.to = function(target, duration, vars, position) {
			var Engine = (vars.repeat && _globals.TweenMax) || TweenLite;
			return duration ? this.add( new Engine(target, duration, vars), position) : this.set(target, vars, position);
		};

		p.from = function(target, duration, vars, position) {
			return this.add( ((vars.repeat && _globals.TweenMax) || TweenLite).from(target, duration, vars), position);
		};

		p.fromTo = function(target, duration, fromVars, toVars, position) {
			var Engine = (toVars.repeat && _globals.TweenMax) || TweenLite;
			return duration ? this.add( Engine.fromTo(target, duration, fromVars, toVars), position) : this.set(target, toVars, position);
		};

		p.staggerTo = function(targets, duration, vars, stagger, position, onCompleteAll, onCompleteAllParams, onCompleteAllScope) {
			var tl = new TimelineLite({onComplete:onCompleteAll, onCompleteParams:onCompleteAllParams, callbackScope:onCompleteAllScope, smoothChildTiming:this.smoothChildTiming}),
				cycle = vars.cycle,
				copy, i;
			if (typeof(targets) === "string") {
				targets = TweenLite.selector(targets) || targets;
			}
			targets = targets || [];
			if (_isSelector(targets)) { //senses if the targets object is a selector. If it is, we should translate it into an array.
				targets = _slice(targets);
			}
			stagger = stagger || 0;
			if (stagger < 0) {
				targets = _slice(targets);
				targets.reverse();
				stagger *= -1;
			}
			for (i = 0; i < targets.length; i++) {
				copy = _copy(vars);
				if (copy.startAt) {
					copy.startAt = _copy(copy.startAt);
					if (copy.startAt.cycle) {
						_applyCycle(copy.startAt, targets, i);
					}
				}
				if (cycle) {
					_applyCycle(copy, targets, i);
				}
				tl.to(targets[i], duration, copy, i * stagger);
			}
			return this.add(tl, position);
		};

		p.staggerFrom = function(targets, duration, vars, stagger, position, onCompleteAll, onCompleteAllParams, onCompleteAllScope) {
			vars.immediateRender = (vars.immediateRender != false);
			vars.runBackwards = true;
			return this.staggerTo(targets, duration, vars, stagger, position, onCompleteAll, onCompleteAllParams, onCompleteAllScope);
		};

		p.staggerFromTo = function(targets, duration, fromVars, toVars, stagger, position, onCompleteAll, onCompleteAllParams, onCompleteAllScope) {
			toVars.startAt = fromVars;
			toVars.immediateRender = (toVars.immediateRender != false && fromVars.immediateRender != false);
			return this.staggerTo(targets, duration, toVars, stagger, position, onCompleteAll, onCompleteAllParams, onCompleteAllScope);
		};

		p.call = function(callback, params, scope, position) {
			return this.add( TweenLite.delayedCall(0, callback, params, scope), position);
		};

		p.set = function(target, vars, position) {
			position = this._parseTimeOrLabel(position, 0, true);
			if (vars.immediateRender == null) {
				vars.immediateRender = (position === this._time && !this._paused);
			}
			return this.add( new TweenLite(target, 0, vars), position);
		};

		TimelineLite.exportRoot = function(vars, ignoreDelayedCalls) {
			vars = vars || {};
			if (vars.smoothChildTiming == null) {
				vars.smoothChildTiming = true;
			}
			var tl = new TimelineLite(vars),
				root = tl._timeline,
				tween, next;
			if (ignoreDelayedCalls == null) {
				ignoreDelayedCalls = true;
			}
			root._remove(tl, true);
			tl._startTime = 0;
			tl._rawPrevTime = tl._time = tl._totalTime = root._time;
			tween = root._first;
			while (tween) {
				next = tween._next;
				if (!ignoreDelayedCalls || !(tween instanceof TweenLite && tween.target === tween.vars.onComplete)) {
					tl.add(tween, tween._startTime - tween._delay);
				}
				tween = next;
			}
			root.add(tl, 0);
			return tl;
		};

		p.add = function(value, position, align, stagger) {
			var curTime, l, i, child, tl, beforeRawTime;
			if (typeof(position) !== "number") {
				position = this._parseTimeOrLabel(position, 0, true, value);
			}
			if (!(value instanceof Animation)) {
				if ((value instanceof Array) || (value && value.push && _isArray(value))) {
					align = align || "normal";
					stagger = stagger || 0;
					curTime = position;
					l = value.length;
					for (i = 0; i < l; i++) {
						if (_isArray(child = value[i])) {
							child = new TimelineLite({tweens:child});
						}
						this.add(child, curTime);
						if (typeof(child) !== "string" && typeof(child) !== "function") {
							if (align === "sequence") {
								curTime = child._startTime + (child.totalDuration() / child._timeScale);
							} else if (align === "start") {
								child._startTime -= child.delay();
							}
						}
						curTime += stagger;
					}
					return this._uncache(true);
				} else if (typeof(value) === "string") {
					return this.addLabel(value, position);
				} else if (typeof(value) === "function") {
					value = TweenLite.delayedCall(0, value);
				} else {
					throw("Cannot add " + value + " into the timeline; it is not a tween, timeline, function, or string.");
				}
			}

			SimpleTimeline.prototype.add.call(this, value, position);

			//if the timeline has already ended but the inserted tween/timeline extends the duration, we should enable this timeline again so that it renders properly. We should also align the playhead with the parent timeline's when appropriate.
			if (this._gc || this._time === this._duration) if (!this._paused) if (this._duration < this.duration()) {
				//in case any of the ancestors had completed but should now be enabled...
				tl = this;
				beforeRawTime = (tl.rawTime() > value._startTime); //if the tween is placed on the timeline so that it starts BEFORE the current rawTime, we should align the playhead (move the timeline). This is because sometimes users will create a timeline, let it finish, and much later append a tween and expect it to run instead of jumping to its end state. While technically one could argue that it should jump to its end state, that's not what users intuitively expect.
				while (tl._timeline) {
					if (beforeRawTime && tl._timeline.smoothChildTiming) {
						tl.totalTime(tl._totalTime, true); //moves the timeline (shifts its startTime) if necessary, and also enables it.
					} else if (tl._gc) {
						tl._enabled(true, false);
					}
					tl = tl._timeline;
				}
			}

			return this;
		};

		p.remove = function(value) {
			if (value instanceof Animation) {
				this._remove(value, false);
				var tl = value._timeline = value.vars.useFrames ? Animation._rootFramesTimeline : Animation._rootTimeline; //now that it's removed, default it to the root timeline so that if it gets played again, it doesn't jump back into this timeline.
				value._startTime = (value._paused ? value._pauseTime : tl._time) - ((!value._reversed ? value._totalTime : value.totalDuration() - value._totalTime) / value._timeScale); //ensure that if it gets played again, the timing is correct.
				return this;
			} else if (value instanceof Array || (value && value.push && _isArray(value))) {
				var i = value.length;
				while (--i > -1) {
					this.remove(value[i]);
				}
				return this;
			} else if (typeof(value) === "string") {
				return this.removeLabel(value);
			}
			return this.kill(null, value);
		};

		p._remove = function(tween, skipDisable) {
			SimpleTimeline.prototype._remove.call(this, tween, skipDisable);
			var last = this._last;
			if (!last) {
				this._time = this._totalTime = this._duration = this._totalDuration = 0;
			} else if (this._time > last._startTime + last._totalDuration / last._timeScale) {
				this._time = this.duration();
				this._totalTime = this._totalDuration;
			}
			return this;
		};

		p.append = function(value, offsetOrLabel) {
			return this.add(value, this._parseTimeOrLabel(null, offsetOrLabel, true, value));
		};

		p.insert = p.insertMultiple = function(value, position, align, stagger) {
			return this.add(value, position || 0, align, stagger);
		};

		p.appendMultiple = function(tweens, offsetOrLabel, align, stagger) {
			return this.add(tweens, this._parseTimeOrLabel(null, offsetOrLabel, true, tweens), align, stagger);
		};

		p.addLabel = function(label, position) {
			this._labels[label] = this._parseTimeOrLabel(position);
			return this;
		};

		p.addPause = function(position, callback, params, scope) {
			var t = TweenLite.delayedCall(0, _pauseCallback, params, scope || this);
			t.vars.onComplete = t.vars.onReverseComplete = callback;
			t.data = "isPause";
			this._hasPause = true;
			return this.add(t, position);
		};

		p.removeLabel = function(label) {
			delete this._labels[label];
			return this;
		};

		p.getLabelTime = function(label) {
			return (this._labels[label] != null) ? this._labels[label] : -1;
		};

		p._parseTimeOrLabel = function(timeOrLabel, offsetOrLabel, appendIfAbsent, ignore) {
			var i;
			//if we're about to add a tween/timeline (or an array of them) that's already a child of this timeline, we should remove it first so that it doesn't contaminate the duration().
			if (ignore instanceof Animation && ignore.timeline === this) {
				this.remove(ignore);
			} else if (ignore && ((ignore instanceof Array) || (ignore.push && _isArray(ignore)))) {
				i = ignore.length;
				while (--i > -1) {
					if (ignore[i] instanceof Animation && ignore[i].timeline === this) {
						this.remove(ignore[i]);
					}
				}
			}
			if (typeof(offsetOrLabel) === "string") {
				return this._parseTimeOrLabel(offsetOrLabel, (appendIfAbsent && typeof(timeOrLabel) === "number" && this._labels[offsetOrLabel] == null) ? timeOrLabel - this.duration() : 0, appendIfAbsent);
			}
			offsetOrLabel = offsetOrLabel || 0;
			if (typeof(timeOrLabel) === "string" && (isNaN(timeOrLabel) || this._labels[timeOrLabel] != null)) { //if the string is a number like "1", check to see if there's a label with that name, otherwise interpret it as a number (absolute value).
				i = timeOrLabel.indexOf("=");
				if (i === -1) {
					if (this._labels[timeOrLabel] == null) {
						return appendIfAbsent ? (this._labels[timeOrLabel] = this.duration() + offsetOrLabel) : offsetOrLabel;
					}
					return this._labels[timeOrLabel] + offsetOrLabel;
				}
				offsetOrLabel = parseInt(timeOrLabel.charAt(i-1) + "1", 10) * Number(timeOrLabel.substr(i+1));
				timeOrLabel = (i > 1) ? this._parseTimeOrLabel(timeOrLabel.substr(0, i-1), 0, appendIfAbsent) : this.duration();
			} else if (timeOrLabel == null) {
				timeOrLabel = this.duration();
			}
			return Number(timeOrLabel) + offsetOrLabel;
		};

		p.seek = function(position, suppressEvents) {
			return this.totalTime((typeof(position) === "number") ? position : this._parseTimeOrLabel(position), (suppressEvents !== false));
		};

		p.stop = function() {
			return this.paused(true);
		};

		p.gotoAndPlay = function(position, suppressEvents) {
			return this.play(position, suppressEvents);
		};

		p.gotoAndStop = function(position, suppressEvents) {
			return this.pause(position, suppressEvents);
		};

		p.render = function(time, suppressEvents, force) {
			if (this._gc) {
				this._enabled(true, false);
			}
			var totalDur = (!this._dirty) ? this._totalDuration : this.totalDuration(),
				prevTime = this._time,
				prevStart = this._startTime,
				prevTimeScale = this._timeScale,
				prevPaused = this._paused,
				tween, isComplete, next, callback, internalForce, pauseTween;
			if (time >= totalDur) {
				this._totalTime = this._time = totalDur;
				if (!this._reversed) if (!this._hasPausedChild()) {
					isComplete = true;
					callback = "onComplete";
					internalForce = !!this._timeline.autoRemoveChildren; //otherwise, if the animation is unpaused/activated after it's already finished, it doesn't get removed from the parent timeline.
					if (this._duration === 0) if (time === 0 || this._rawPrevTime < 0 || this._rawPrevTime === _tinyNum) if (this._rawPrevTime !== time && this._first) {
						internalForce = true;
						if (this._rawPrevTime > _tinyNum) {
							callback = "onReverseComplete";
						}
					}
				}
				this._rawPrevTime = (this._duration || !suppressEvents || time || this._rawPrevTime === time) ? time : _tinyNum; //when the playhead arrives at EXACTLY time 0 (right on top) of a zero-duration timeline or tween, we need to discern if events are suppressed so that when the playhead moves again (next time), it'll trigger the callback. If events are NOT suppressed, obviously the callback would be triggered in this render. Basically, the callback should fire either when the playhead ARRIVES or LEAVES this exact spot, not both. Imagine doing a timeline.seek(0) and there's a callback that sits at 0. Since events are suppressed on that seek() by default, nothing will fire, but when the playhead moves off of that position, the callback should fire. This behavior is what people intuitively expect. We set the _rawPrevTime to be a precise tiny number to indicate this scenario rather than using another property/variable which would increase memory usage. This technique is less readable, but more efficient.
				time = totalDur + 0.0001; //to avoid occasional floating point rounding errors - sometimes child tweens/timelines were not being fully completed (their progress might be 0.999999999999998 instead of 1 because when _time - tween._startTime is performed, floating point errors would return a value that was SLIGHTLY off). Try (999999999999.7 - 999999999999) * 1 = 0.699951171875 instead of 0.7.

			} else if (time < 0.0000001) { //to work around occasional floating point math artifacts, round super small values to 0.
				this._totalTime = this._time = 0;
				if (prevTime !== 0 || (this._duration === 0 && this._rawPrevTime !== _tinyNum && (this._rawPrevTime > 0 || (time < 0 && this._rawPrevTime >= 0)))) {
					callback = "onReverseComplete";
					isComplete = this._reversed;
				}
				if (time < 0) {
					this._active = false;
					if (this._timeline.autoRemoveChildren && this._reversed) { //ensures proper GC if a timeline is resumed after it's finished reversing.
						internalForce = isComplete = true;
						callback = "onReverseComplete";
					} else if (this._rawPrevTime >= 0 && this._first) { //when going back beyond the start, force a render so that zero-duration tweens that sit at the very beginning render their start values properly. Otherwise, if the parent timeline's playhead lands exactly at this timeline's startTime, and then moves backwards, the zero-duration tweens at the beginning would still be at their end state.
						internalForce = true;
					}
					this._rawPrevTime = time;
				} else {
					this._rawPrevTime = (this._duration || !suppressEvents || time || this._rawPrevTime === time) ? time : _tinyNum; //when the playhead arrives at EXACTLY time 0 (right on top) of a zero-duration timeline or tween, we need to discern if events are suppressed so that when the playhead moves again (next time), it'll trigger the callback. If events are NOT suppressed, obviously the callback would be triggered in this render. Basically, the callback should fire either when the playhead ARRIVES or LEAVES this exact spot, not both. Imagine doing a timeline.seek(0) and there's a callback that sits at 0. Since events are suppressed on that seek() by default, nothing will fire, but when the playhead moves off of that position, the callback should fire. This behavior is what people intuitively expect. We set the _rawPrevTime to be a precise tiny number to indicate this scenario rather than using another property/variable which would increase memory usage. This technique is less readable, but more efficient.
					if (time === 0 && isComplete) { //if there's a zero-duration tween at the very beginning of a timeline and the playhead lands EXACTLY at time 0, that tween will correctly render its end values, but we need to keep the timeline alive for one more render so that the beginning values render properly as the parent's playhead keeps moving beyond the begining. Imagine obj.x starts at 0 and then we do tl.set(obj, {x:100}).to(obj, 1, {x:200}) and then later we tl.reverse()...the goal is to have obj.x revert to 0. If the playhead happens to land on exactly 0, without this chunk of code, it'd complete the timeline and remove it from the rendering queue (not good).
						tween = this._first;
						while (tween && tween._startTime === 0) {
							if (!tween._duration) {
								isComplete = false;
							}
							tween = tween._next;
						}
					}
					time = 0; //to avoid occasional floating point rounding errors (could cause problems especially with zero-duration tweens at the very beginning of the timeline)
					if (!this._initted) {
						internalForce = true;
					}
				}

			} else {

				if (this._hasPause && !this._forcingPlayhead && !suppressEvents) {
					if (time >= prevTime) {
						tween = this._first;
						while (tween && tween._startTime <= time && !pauseTween) {
							if (!tween._duration) if (tween.data === "isPause" && !tween.ratio && !(tween._startTime === 0 && this._rawPrevTime === 0)) {
								pauseTween = tween;
							}
							tween = tween._next;
						}
					} else {
						tween = this._last;
						while (tween && tween._startTime >= time && !pauseTween) {
							if (!tween._duration) if (tween.data === "isPause" && tween._rawPrevTime > 0) {
								pauseTween = tween;
							}
							tween = tween._prev;
						}
					}
					if (pauseTween) {
						this._time = time = pauseTween._startTime;
						this._totalTime = time + (this._cycle * (this._totalDuration + this._repeatDelay));
					}
				}

				this._totalTime = this._time = this._rawPrevTime = time;
			}
			if ((this._time === prevTime || !this._first) && !force && !internalForce && !pauseTween) {
				return;
			} else if (!this._initted) {
				this._initted = true;
			}

			if (!this._active) if (!this._paused && this._time !== prevTime && time > 0) {
				this._active = true;  //so that if the user renders the timeline (as opposed to the parent timeline rendering it), it is forced to re-render and align it with the proper time/frame on the next rendering cycle. Maybe the timeline already finished but the user manually re-renders it as halfway done, for example.
			}

			if (prevTime === 0) if (this.vars.onStart) if (this._time !== 0) if (!suppressEvents) {
				this._callback("onStart");
			}

			if (this._time >= prevTime) {
				tween = this._first;
				while (tween) {
					next = tween._next; //record it here because the value could change after rendering...
					if (this._paused && !prevPaused) { //in case a tween pauses the timeline when rendering
						break;
					} else if (tween._active || (tween._startTime <= this._time && !tween._paused && !tween._gc)) {
						if (pauseTween === tween) {
							this.pause();
						}
						if (!tween._reversed) {
							tween.render((time - tween._startTime) * tween._timeScale, suppressEvents, force);
						} else {
							tween.render(((!tween._dirty) ? tween._totalDuration : tween.totalDuration()) - ((time - tween._startTime) * tween._timeScale), suppressEvents, force);
						}
					}
					tween = next;
				}
			} else {
				tween = this._last;
				while (tween) {
					next = tween._prev; //record it here because the value could change after rendering...
					if (this._paused && !prevPaused) { //in case a tween pauses the timeline when rendering
						break;
					} else if (tween._active || (tween._startTime <= prevTime && !tween._paused && !tween._gc)) {
						if (pauseTween === tween) {
							pauseTween = tween._prev; //the linked list is organized by _startTime, thus it's possible that a tween could start BEFORE the pause and end after it, in which case it would be positioned before the pause tween in the linked list, but we should render it before we pause() the timeline and cease rendering. This is only a concern when going in reverse.
							while (pauseTween && pauseTween.endTime() > this._time) {
								pauseTween.render( (pauseTween._reversed ? pauseTween.totalDuration() - ((time - pauseTween._startTime) * pauseTween._timeScale) : (time - pauseTween._startTime) * pauseTween._timeScale), suppressEvents, force);
								pauseTween = pauseTween._prev;
							}
							pauseTween = null;
							this.pause();
						}
						if (!tween._reversed) {
							tween.render((time - tween._startTime) * tween._timeScale, suppressEvents, force);
						} else {
							tween.render(((!tween._dirty) ? tween._totalDuration : tween.totalDuration()) - ((time - tween._startTime) * tween._timeScale), suppressEvents, force);
						}
					}
					tween = next;
				}
			}

			if (this._onUpdate) if (!suppressEvents) {
				if (_lazyTweens.length) { //in case rendering caused any tweens to lazy-init, we should render them because typically when a timeline finishes, users expect things to have rendered fully. Imagine an onUpdate on a timeline that reports/checks tweened values.
					_lazyRender();
				}
				this._callback("onUpdate");
			}

			if (callback) if (!this._gc) if (prevStart === this._startTime || prevTimeScale !== this._timeScale) if (this._time === 0 || totalDur >= this.totalDuration()) { //if one of the tweens that was rendered altered this timeline's startTime (like if an onComplete reversed the timeline), it probably isn't complete. If it is, don't worry, because whatever call altered the startTime would complete if it was necessary at the new time. The only exception is the timeScale property. Also check _gc because there's a chance that kill() could be called in an onUpdate
				if (isComplete) {
					if (_lazyTweens.length) { //in case rendering caused any tweens to lazy-init, we should render them because typically when a timeline finishes, users expect things to have rendered fully. Imagine an onComplete on a timeline that reports/checks tweened values.
						_lazyRender();
					}
					if (this._timeline.autoRemoveChildren) {
						this._enabled(false, false);
					}
					this._active = false;
				}
				if (!suppressEvents && this.vars[callback]) {
					this._callback(callback);
				}
			}
		};

		p._hasPausedChild = function() {
			var tween = this._first;
			while (tween) {
				if (tween._paused || ((tween instanceof TimelineLite) && tween._hasPausedChild())) {
					return true;
				}
				tween = tween._next;
			}
			return false;
		};

		p.getChildren = function(nested, tweens, timelines, ignoreBeforeTime) {
			ignoreBeforeTime = ignoreBeforeTime || -9999999999;
			var a = [],
				tween = this._first,
				cnt = 0;
			while (tween) {
				if (tween._startTime < ignoreBeforeTime) {
					//do nothing
				} else if (tween instanceof TweenLite) {
					if (tweens !== false) {
						a[cnt++] = tween;
					}
				} else {
					if (timelines !== false) {
						a[cnt++] = tween;
					}
					if (nested !== false) {
						a = a.concat(tween.getChildren(true, tweens, timelines));
						cnt = a.length;
					}
				}
				tween = tween._next;
			}
			return a;
		};

		p.getTweensOf = function(target, nested) {
			var disabled = this._gc,
				a = [],
				cnt = 0,
				tweens, i;
			if (disabled) {
				this._enabled(true, true); //getTweensOf() filters out disabled tweens, and we have to mark them as _gc = true when the timeline completes in order to allow clean garbage collection, so temporarily re-enable the timeline here.
			}
			tweens = TweenLite.getTweensOf(target);
			i = tweens.length;
			while (--i > -1) {
				if (tweens[i].timeline === this || (nested && this._contains(tweens[i]))) {
					a[cnt++] = tweens[i];
				}
			}
			if (disabled) {
				this._enabled(false, true);
			}
			return a;
		};

		p.recent = function() {
			return this._recent;
		};

		p._contains = function(tween) {
			var tl = tween.timeline;
			while (tl) {
				if (tl === this) {
					return true;
				}
				tl = tl.timeline;
			}
			return false;
		};

		p.shiftChildren = function(amount, adjustLabels, ignoreBeforeTime) {
			ignoreBeforeTime = ignoreBeforeTime || 0;
			var tween = this._first,
				labels = this._labels,
				p;
			while (tween) {
				if (tween._startTime >= ignoreBeforeTime) {
					tween._startTime += amount;
				}
				tween = tween._next;
			}
			if (adjustLabels) {
				for (p in labels) {
					if (labels[p] >= ignoreBeforeTime) {
						labels[p] += amount;
					}
				}
			}
			return this._uncache(true);
		};

		p._kill = function(vars, target) {
			if (!vars && !target) {
				return this._enabled(false, false);
			}
			var tweens = (!target) ? this.getChildren(true, true, false) : this.getTweensOf(target),
				i = tweens.length,
				changed = false;
			while (--i > -1) {
				if (tweens[i]._kill(vars, target)) {
					changed = true;
				}
			}
			return changed;
		};

		p.clear = function(labels) {
			var tweens = this.getChildren(false, true, true),
				i = tweens.length;
			this._time = this._totalTime = 0;
			while (--i > -1) {
				tweens[i]._enabled(false, false);
			}
			if (labels !== false) {
				this._labels = {};
			}
			return this._uncache(true);
		};

		p.invalidate = function() {
			var tween = this._first;
			while (tween) {
				tween.invalidate();
				tween = tween._next;
			}
			return Animation.prototype.invalidate.call(this);;
		};

		p._enabled = function(enabled, ignoreTimeline) {
			if (enabled === this._gc) {
				var tween = this._first;
				while (tween) {
					tween._enabled(enabled, true);
					tween = tween._next;
				}
			}
			return SimpleTimeline.prototype._enabled.call(this, enabled, ignoreTimeline);
		};

		p.totalTime = function(time, suppressEvents, uncapped) {
			this._forcingPlayhead = true;
			var val = Animation.prototype.totalTime.apply(this, arguments);
			this._forcingPlayhead = false;
			return val;
		};

		p.duration = function(value) {
			if (!arguments.length) {
				if (this._dirty) {
					this.totalDuration(); //just triggers recalculation
				}
				return this._duration;
			}
			if (this.duration() !== 0 && value !== 0) {
				this.timeScale(this._duration / value);
			}
			return this;
		};

		p.totalDuration = function(value) {
			if (!arguments.length) {
				if (this._dirty) {
					var max = 0,
						tween = this._last,
						prevStart = 999999999999,
						prev, end;
					while (tween) {
						prev = tween._prev; //record it here in case the tween changes position in the sequence...
						if (tween._dirty) {
							tween.totalDuration(); //could change the tween._startTime, so make sure the tween's cache is clean before analyzing it.
						}
						if (tween._startTime > prevStart && this._sortChildren && !tween._paused) { //in case one of the tweens shifted out of order, it needs to be re-inserted into the correct position in the sequence
							this.add(tween, tween._startTime - tween._delay);
						} else {
							prevStart = tween._startTime;
						}
						if (tween._startTime < 0 && !tween._paused) { //children aren't allowed to have negative startTimes unless smoothChildTiming is true, so adjust here if one is found.
							max -= tween._startTime;
							if (this._timeline.smoothChildTiming) {
								this._startTime += tween._startTime / this._timeScale;
							}
							this.shiftChildren(-tween._startTime, false, -9999999999);
							prevStart = 0;
						}
						end = tween._startTime + (tween._totalDuration / tween._timeScale);
						if (end > max) {
							max = end;
						}
						tween = prev;
					}
					this._duration = this._totalDuration = max;
					this._dirty = false;
				}
				return this._totalDuration;
			}
			if (this.totalDuration() !== 0) if (value !== 0) {
				this.timeScale(this._totalDuration / value);
			}
			return this;
		};

		p.paused = function(value) {
			if (!value) { //if there's a pause directly at the spot from where we're unpausing, skip it.
				var tween = this._first,
					time = this._time;
				while (tween) {
					if (tween._startTime === time && tween.data === "isPause") {
						tween._rawPrevTime = 0; //remember, _rawPrevTime is how zero-duration tweens/callbacks sense directionality and determine whether or not to fire. If _rawPrevTime is the same as _startTime on the next render, it won't fire.
					}
					tween = tween._next;
				}
			}
			return Animation.prototype.paused.apply(this, arguments);
		};

		p.usesFrames = function() {
			var tl = this._timeline;
			while (tl._timeline) {
				tl = tl._timeline;
			}
			return (tl === Animation._rootFramesTimeline);
		};

		p.rawTime = function() {
			return this._paused ? this._totalTime : (this._timeline.rawTime() - this._startTime) * this._timeScale;
		};

		return TimelineLite;

	}, true);


}); if (_gsScope._gsDefine) { _gsScope._gsQueue.pop()(); }

//export to AMD/RequireJS and CommonJS/Node (precursor to full modular build system coming at a later date)
(function(name) {
	"use strict";
	var getGlobal = function() {
		return (_gsScope.GreenSockGlobals || _gsScope)[name];
	};
	if (typeof(define) === "function" && define.amd) { //AMD
		define(["TweenLite"], getGlobal);
	} else if (typeof(module) !== "undefined" && module.exports) { //node
		require("./TweenLite.js"); //dependency
		module.exports = getGlobal();
	}
}("TimelineLite"));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./TweenLite.js":4}],4:[function(require,module,exports){
(function (global){
/*!
 * VERSION: 1.18.0
 * DATE: 2015-09-03
 * UPDATES AND DOCS AT: http://greensock.com
 *
 * @license Copyright (c) 2008-2015, GreenSock. All rights reserved.
 * This work is subject to the terms at http://greensock.com/standard-license or for
 * Club GreenSock members, the software agreement that was issued with your membership.
 * 
 * @author: Jack Doyle, jack@greensock.com
 */
(function(window, moduleName) {

		"use strict";
		var _globals = window.GreenSockGlobals = window.GreenSockGlobals || window;
		if (_globals.TweenLite) {
			return; //in case the core set of classes is already loaded, don't instantiate twice.
		}
		var _namespace = function(ns) {
				var a = ns.split("."),
					p = _globals, i;
				for (i = 0; i < a.length; i++) {
					p[a[i]] = p = p[a[i]] || {};
				}
				return p;
			},
			gs = _namespace("com.greensock"),
			_tinyNum = 0.0000000001,
			_slice = function(a) { //don't use Array.prototype.slice.call(target, 0) because that doesn't work in IE8 with a NodeList that's returned by querySelectorAll()
				var b = [],
					l = a.length,
					i;
				for (i = 0; i !== l; b.push(a[i++])) {}
				return b;
			},
			_emptyFunc = function() {},
			_isArray = (function() { //works around issues in iframe environments where the Array global isn't shared, thus if the object originates in a different window/iframe, "(obj instanceof Array)" will evaluate false. We added some speed optimizations to avoid Object.prototype.toString.call() unless it's absolutely necessary because it's VERY slow (like 20x slower)
				var toString = Object.prototype.toString,
					array = toString.call([]);
				return function(obj) {
					return obj != null && (obj instanceof Array || (typeof(obj) === "object" && !!obj.push && toString.call(obj) === array));
				};
			}()),
			a, i, p, _ticker, _tickerActive,
			_defLookup = {},

			/**
			 * @constructor
			 * Defines a GreenSock class, optionally with an array of dependencies that must be instantiated first and passed into the definition.
			 * This allows users to load GreenSock JS files in any order even if they have interdependencies (like CSSPlugin extends TweenPlugin which is
			 * inside TweenLite.js, but if CSSPlugin is loaded first, it should wait to run its code until TweenLite.js loads and instantiates TweenPlugin
			 * and then pass TweenPlugin to CSSPlugin's definition). This is all done automatically and internally.
			 *
			 * Every definition will be added to a "com.greensock" global object (typically window, but if a window.GreenSockGlobals object is found,
			 * it will go there as of v1.7). For example, TweenLite will be found at window.com.greensock.TweenLite and since it's a global class that should be available anywhere,
			 * it is ALSO referenced at window.TweenLite. However some classes aren't considered global, like the base com.greensock.core.Animation class, so
			 * those will only be at the package like window.com.greensock.core.Animation. Again, if you define a GreenSockGlobals object on the window, everything
			 * gets tucked neatly inside there instead of on the window directly. This allows you to do advanced things like load multiple versions of GreenSock
			 * files and put them into distinct objects (imagine a banner ad uses a newer version but the main site uses an older one). In that case, you could
			 * sandbox the banner one like:
			 *
			 * <script>
			 *     var gs = window.GreenSockGlobals = {}; //the newer version we're about to load could now be referenced in a "gs" object, like gs.TweenLite.to(...). Use whatever alias you want as long as it's unique, "gs" or "banner" or whatever.
			 * </script>
			 * <script src="js/greensock/v1.7/TweenMax.js"></script>
			 * <script>
			 *     window.GreenSockGlobals = window._gsQueue = window._gsDefine = null; //reset it back to null (along with the special _gsQueue variable) so that the next load of TweenMax affects the window and we can reference things directly like TweenLite.to(...)
			 * </script>
			 * <script src="js/greensock/v1.6/TweenMax.js"></script>
			 * <script>
			 *     gs.TweenLite.to(...); //would use v1.7
			 *     TweenLite.to(...); //would use v1.6
			 * </script>
			 *
			 * @param {!string} ns The namespace of the class definition, leaving off "com.greensock." as that's assumed. For example, "TweenLite" or "plugins.CSSPlugin" or "easing.Back".
			 * @param {!Array.<string>} dependencies An array of dependencies (described as their namespaces minus "com.greensock." prefix). For example ["TweenLite","plugins.TweenPlugin","core.Animation"]
			 * @param {!function():Object} func The function that should be called and passed the resolved dependencies which will return the actual class for this definition.
			 * @param {boolean=} global If true, the class will be added to the global scope (typically window unless you define a window.GreenSockGlobals object)
			 */
			Definition = function(ns, dependencies, func, global) {
				this.sc = (_defLookup[ns]) ? _defLookup[ns].sc : []; //subclasses
				_defLookup[ns] = this;
				this.gsClass = null;
				this.func = func;
				var _classes = [];
				this.check = function(init) {
					var i = dependencies.length,
						missing = i,
						cur, a, n, cl, hasModule;
					while (--i > -1) {
						if ((cur = _defLookup[dependencies[i]] || new Definition(dependencies[i], [])).gsClass) {
							_classes[i] = cur.gsClass;
							missing--;
						} else if (init) {
							cur.sc.push(this);
						}
					}
					if (missing === 0 && func) {
						a = ("com.greensock." + ns).split(".");
						n = a.pop();
						cl = _namespace(a.join("."))[n] = this.gsClass = func.apply(func, _classes);

						//exports to multiple environments
						if (global) {
							_globals[n] = cl; //provides a way to avoid global namespace pollution. By default, the main classes like TweenLite, Power1, Strong, etc. are added to window unless a GreenSockGlobals is defined. So if you want to have things added to a custom object instead, just do something like window.GreenSockGlobals = {} before loading any GreenSock files. You can even set up an alias like window.GreenSockGlobals = windows.gs = {} so that you can access everything like gs.TweenLite. Also remember that ALL classes are added to the window.com.greensock object (in their respective packages, like com.greensock.easing.Power1, com.greensock.TweenLite, etc.)
							hasModule = (typeof(module) !== "undefined" && module.exports);
							if (!hasModule && typeof(define) === "function" && define.amd){ //AMD
								define((window.GreenSockAMDPath ? window.GreenSockAMDPath + "/" : "") + ns.split(".").pop(), [], function() { return cl; });
							} else if (ns === moduleName && hasModule){ //node
								module.exports = cl;
							}
						}
						for (i = 0; i < this.sc.length; i++) {
							this.sc[i].check();
						}
					}
				};
				this.check(true);
			},

			//used to create Definition instances (which basically registers a class that has dependencies).
			_gsDefine = window._gsDefine = function(ns, dependencies, func, global) {
				return new Definition(ns, dependencies, func, global);
			},

			//a quick way to create a class that doesn't have any dependencies. Returns the class, but first registers it in the GreenSock namespace so that other classes can grab it (other classes might be dependent on the class).
			_class = gs._class = function(ns, func, global) {
				func = func || function() {};
				_gsDefine(ns, [], function(){ return func; }, global);
				return func;
			};

		_gsDefine.globals = _globals;



/*
 * ----------------------------------------------------------------
 * Ease
 * ----------------------------------------------------------------
 */
		var _baseParams = [0, 0, 1, 1],
			_blankArray = [],
			Ease = _class("easing.Ease", function(func, extraParams, type, power) {
				this._func = func;
				this._type = type || 0;
				this._power = power || 0;
				this._params = extraParams ? _baseParams.concat(extraParams) : _baseParams;
			}, true),
			_easeMap = Ease.map = {},
			_easeReg = Ease.register = function(ease, names, types, create) {
				var na = names.split(","),
					i = na.length,
					ta = (types || "easeIn,easeOut,easeInOut").split(","),
					e, name, j, type;
				while (--i > -1) {
					name = na[i];
					e = create ? _class("easing."+name, null, true) : gs.easing[name] || {};
					j = ta.length;
					while (--j > -1) {
						type = ta[j];
						_easeMap[name + "." + type] = _easeMap[type + name] = e[type] = ease.getRatio ? ease : ease[type] || new ease();
					}
				}
			};

		p = Ease.prototype;
		p._calcEnd = false;
		p.getRatio = function(p) {
			if (this._func) {
				this._params[0] = p;
				return this._func.apply(null, this._params);
			}
			var t = this._type,
				pw = this._power,
				r = (t === 1) ? 1 - p : (t === 2) ? p : (p < 0.5) ? p * 2 : (1 - p) * 2;
			if (pw === 1) {
				r *= r;
			} else if (pw === 2) {
				r *= r * r;
			} else if (pw === 3) {
				r *= r * r * r;
			} else if (pw === 4) {
				r *= r * r * r * r;
			}
			return (t === 1) ? 1 - r : (t === 2) ? r : (p < 0.5) ? r / 2 : 1 - (r / 2);
		};

		//create all the standard eases like Linear, Quad, Cubic, Quart, Quint, Strong, Power0, Power1, Power2, Power3, and Power4 (each with easeIn, easeOut, and easeInOut)
		a = ["Linear","Quad","Cubic","Quart","Quint,Strong"];
		i = a.length;
		while (--i > -1) {
			p = a[i]+",Power"+i;
			_easeReg(new Ease(null,null,1,i), p, "easeOut", true);
			_easeReg(new Ease(null,null,2,i), p, "easeIn" + ((i === 0) ? ",easeNone" : ""));
			_easeReg(new Ease(null,null,3,i), p, "easeInOut");
		}
		_easeMap.linear = gs.easing.Linear.easeIn;
		_easeMap.swing = gs.easing.Quad.easeInOut; //for jQuery folks


/*
 * ----------------------------------------------------------------
 * EventDispatcher
 * ----------------------------------------------------------------
 */
		var EventDispatcher = _class("events.EventDispatcher", function(target) {
			this._listeners = {};
			this._eventTarget = target || this;
		});
		p = EventDispatcher.prototype;

		p.addEventListener = function(type, callback, scope, useParam, priority) {
			priority = priority || 0;
			var list = this._listeners[type],
				index = 0,
				listener, i;
			if (list == null) {
				this._listeners[type] = list = [];
			}
			i = list.length;
			while (--i > -1) {
				listener = list[i];
				if (listener.c === callback && listener.s === scope) {
					list.splice(i, 1);
				} else if (index === 0 && listener.pr < priority) {
					index = i + 1;
				}
			}
			list.splice(index, 0, {c:callback, s:scope, up:useParam, pr:priority});
			if (this === _ticker && !_tickerActive) {
				_ticker.wake();
			}
		};

		p.removeEventListener = function(type, callback) {
			var list = this._listeners[type], i;
			if (list) {
				i = list.length;
				while (--i > -1) {
					if (list[i].c === callback) {
						list.splice(i, 1);
						return;
					}
				}
			}
		};

		p.dispatchEvent = function(type) {
			var list = this._listeners[type],
				i, t, listener;
			if (list) {
				i = list.length;
				t = this._eventTarget;
				while (--i > -1) {
					listener = list[i];
					if (listener) {
						if (listener.up) {
							listener.c.call(listener.s || t, {type:type, target:t});
						} else {
							listener.c.call(listener.s || t);
						}
					}
				}
			}
		};


/*
 * ----------------------------------------------------------------
 * Ticker
 * ----------------------------------------------------------------
 */
 		var _reqAnimFrame = window.requestAnimationFrame,
			_cancelAnimFrame = window.cancelAnimationFrame,
			_getTime = Date.now || function() {return new Date().getTime();},
			_lastUpdate = _getTime();

		//now try to determine the requestAnimationFrame and cancelAnimationFrame functions and if none are found, we'll use a setTimeout()/clearTimeout() polyfill.
		a = ["ms","moz","webkit","o"];
		i = a.length;
		while (--i > -1 && !_reqAnimFrame) {
			_reqAnimFrame = window[a[i] + "RequestAnimationFrame"];
			_cancelAnimFrame = window[a[i] + "CancelAnimationFrame"] || window[a[i] + "CancelRequestAnimationFrame"];
		}

		_class("Ticker", function(fps, useRAF) {
			var _self = this,
				_startTime = _getTime(),
				_useRAF = (useRAF !== false && _reqAnimFrame),
				_lagThreshold = 500,
				_adjustedLag = 33,
				_tickWord = "tick", //helps reduce gc burden
				_fps, _req, _id, _gap, _nextTime,
				_tick = function(manual) {
					var elapsed = _getTime() - _lastUpdate,
						overlap, dispatch;
					if (elapsed > _lagThreshold) {
						_startTime += elapsed - _adjustedLag;
					}
					_lastUpdate += elapsed;
					_self.time = (_lastUpdate - _startTime) / 1000;
					overlap = _self.time - _nextTime;
					if (!_fps || overlap > 0 || manual === true) {
						_self.frame++;
						_nextTime += overlap + (overlap >= _gap ? 0.004 : _gap - overlap);
						dispatch = true;
					}
					if (manual !== true) { //make sure the request is made before we dispatch the "tick" event so that timing is maintained. Otherwise, if processing the "tick" requires a bunch of time (like 15ms) and we're using a setTimeout() that's based on 16.7ms, it'd technically take 31.7ms between frames otherwise.
						_id = _req(_tick);
					}
					if (dispatch) {
						_self.dispatchEvent(_tickWord);
					}
				};

			EventDispatcher.call(_self);
			_self.time = _self.frame = 0;
			_self.tick = function() {
				_tick(true);
			};

			_self.lagSmoothing = function(threshold, adjustedLag) {
				_lagThreshold = threshold || (1 / _tinyNum); //zero should be interpreted as basically unlimited
				_adjustedLag = Math.min(adjustedLag, _lagThreshold, 0);
			};

			_self.sleep = function() {
				if (_id == null) {
					return;
				}
				if (!_useRAF || !_cancelAnimFrame) {
					clearTimeout(_id);
				} else {
					_cancelAnimFrame(_id);
				}
				_req = _emptyFunc;
				_id = null;
				if (_self === _ticker) {
					_tickerActive = false;
				}
			};

			_self.wake = function() {
				if (_id !== null) {
					_self.sleep();
				} else if (_self.frame > 10) { //don't trigger lagSmoothing if we're just waking up, and make sure that at least 10 frames have elapsed because of the iOS bug that we work around below with the 1.5-second setTimout().
					_lastUpdate = _getTime() - _lagThreshold + 5;
				}
				_req = (_fps === 0) ? _emptyFunc : (!_useRAF || !_reqAnimFrame) ? function(f) { return setTimeout(f, ((_nextTime - _self.time) * 1000 + 1) | 0); } : _reqAnimFrame;
				if (_self === _ticker) {
					_tickerActive = true;
				}
				_tick(2);
			};

			_self.fps = function(value) {
				if (!arguments.length) {
					return _fps;
				}
				_fps = value;
				_gap = 1 / (_fps || 60);
				_nextTime = this.time + _gap;
				_self.wake();
			};

			_self.useRAF = function(value) {
				if (!arguments.length) {
					return _useRAF;
				}
				_self.sleep();
				_useRAF = value;
				_self.fps(_fps);
			};
			_self.fps(fps);

			//a bug in iOS 6 Safari occasionally prevents the requestAnimationFrame from working initially, so we use a 1.5-second timeout that automatically falls back to setTimeout() if it senses this condition.
			setTimeout(function() {
				if (_useRAF && _self.frame < 5) {
					_self.useRAF(false);
				}
			}, 1500);
		});

		p = gs.Ticker.prototype = new gs.events.EventDispatcher();
		p.constructor = gs.Ticker;


/*
 * ----------------------------------------------------------------
 * Animation
 * ----------------------------------------------------------------
 */
		var Animation = _class("core.Animation", function(duration, vars) {
				this.vars = vars = vars || {};
				this._duration = this._totalDuration = duration || 0;
				this._delay = Number(vars.delay) || 0;
				this._timeScale = 1;
				this._active = (vars.immediateRender === true);
				this.data = vars.data;
				this._reversed = (vars.reversed === true);

				if (!_rootTimeline) {
					return;
				}
				if (!_tickerActive) { //some browsers (like iOS 6 Safari) shut down JavaScript execution when the tab is disabled and they [occasionally] neglect to start up requestAnimationFrame again when returning - this code ensures that the engine starts up again properly.
					_ticker.wake();
				}

				var tl = this.vars.useFrames ? _rootFramesTimeline : _rootTimeline;
				tl.add(this, tl._time);

				if (this.vars.paused) {
					this.paused(true);
				}
			});

		_ticker = Animation.ticker = new gs.Ticker();
		p = Animation.prototype;
		p._dirty = p._gc = p._initted = p._paused = false;
		p._totalTime = p._time = 0;
		p._rawPrevTime = -1;
		p._next = p._last = p._onUpdate = p._timeline = p.timeline = null;
		p._paused = false;


		//some browsers (like iOS) occasionally drop the requestAnimationFrame event when the user switches to a different tab and then comes back again, so we use a 2-second setTimeout() to sense if/when that condition occurs and then wake() the ticker.
		var _checkTimeout = function() {
				if (_tickerActive && _getTime() - _lastUpdate > 2000) {
					_ticker.wake();
				}
				setTimeout(_checkTimeout, 2000);
			};
		_checkTimeout();


		p.play = function(from, suppressEvents) {
			if (from != null) {
				this.seek(from, suppressEvents);
			}
			return this.reversed(false).paused(false);
		};

		p.pause = function(atTime, suppressEvents) {
			if (atTime != null) {
				this.seek(atTime, suppressEvents);
			}
			return this.paused(true);
		};

		p.resume = function(from, suppressEvents) {
			if (from != null) {
				this.seek(from, suppressEvents);
			}
			return this.paused(false);
		};

		p.seek = function(time, suppressEvents) {
			return this.totalTime(Number(time), suppressEvents !== false);
		};

		p.restart = function(includeDelay, suppressEvents) {
			return this.reversed(false).paused(false).totalTime(includeDelay ? -this._delay : 0, (suppressEvents !== false), true);
		};

		p.reverse = function(from, suppressEvents) {
			if (from != null) {
				this.seek((from || this.totalDuration()), suppressEvents);
			}
			return this.reversed(true).paused(false);
		};

		p.render = function(time, suppressEvents, force) {
			//stub - we override this method in subclasses.
		};

		p.invalidate = function() {
			this._time = this._totalTime = 0;
			this._initted = this._gc = false;
			this._rawPrevTime = -1;
			if (this._gc || !this.timeline) {
				this._enabled(true);
			}
			return this;
		};

		p.isActive = function() {
			var tl = this._timeline, //the 2 root timelines won't have a _timeline; they're always active.
				startTime = this._startTime,
				rawTime;
			return (!tl || (!this._gc && !this._paused && tl.isActive() && (rawTime = tl.rawTime()) >= startTime && rawTime < startTime + this.totalDuration() / this._timeScale));
		};

		p._enabled = function (enabled, ignoreTimeline) {
			if (!_tickerActive) {
				_ticker.wake();
			}
			this._gc = !enabled;
			this._active = this.isActive();
			if (ignoreTimeline !== true) {
				if (enabled && !this.timeline) {
					this._timeline.add(this, this._startTime - this._delay);
				} else if (!enabled && this.timeline) {
					this._timeline._remove(this, true);
				}
			}
			return false;
		};


		p._kill = function(vars, target) {
			return this._enabled(false, false);
		};

		p.kill = function(vars, target) {
			this._kill(vars, target);
			return this;
		};

		p._uncache = function(includeSelf) {
			var tween = includeSelf ? this : this.timeline;
			while (tween) {
				tween._dirty = true;
				tween = tween.timeline;
			}
			return this;
		};

		p._swapSelfInParams = function(params) {
			var i = params.length,
				copy = params.concat();
			while (--i > -1) {
				if (params[i] === "{self}") {
					copy[i] = this;
				}
			}
			return copy;
		};

		p._callback = function(type) {
			var v = this.vars;
			v[type].apply(v[type + "Scope"] || v.callbackScope || this, v[type + "Params"] || _blankArray);
		};

//----Animation getters/setters --------------------------------------------------------

		p.eventCallback = function(type, callback, params, scope) {
			if ((type || "").substr(0,2) === "on") {
				var v = this.vars;
				if (arguments.length === 1) {
					return v[type];
				}
				if (callback == null) {
					delete v[type];
				} else {
					v[type] = callback;
					v[type + "Params"] = (_isArray(params) && params.join("").indexOf("{self}") !== -1) ? this._swapSelfInParams(params) : params;
					v[type + "Scope"] = scope;
				}
				if (type === "onUpdate") {
					this._onUpdate = callback;
				}
			}
			return this;
		};

		p.delay = function(value) {
			if (!arguments.length) {
				return this._delay;
			}
			if (this._timeline.smoothChildTiming) {
				this.startTime( this._startTime + value - this._delay );
			}
			this._delay = value;
			return this;
		};

		p.duration = function(value) {
			if (!arguments.length) {
				this._dirty = false;
				return this._duration;
			}
			this._duration = this._totalDuration = value;
			this._uncache(true); //true in case it's a TweenMax or TimelineMax that has a repeat - we'll need to refresh the totalDuration.
			if (this._timeline.smoothChildTiming) if (this._time > 0) if (this._time < this._duration) if (value !== 0) {
				this.totalTime(this._totalTime * (value / this._duration), true);
			}
			return this;
		};

		p.totalDuration = function(value) {
			this._dirty = false;
			return (!arguments.length) ? this._totalDuration : this.duration(value);
		};

		p.time = function(value, suppressEvents) {
			if (!arguments.length) {
				return this._time;
			}
			if (this._dirty) {
				this.totalDuration();
			}
			return this.totalTime((value > this._duration) ? this._duration : value, suppressEvents);
		};

		p.totalTime = function(time, suppressEvents, uncapped) {
			if (!_tickerActive) {
				_ticker.wake();
			}
			if (!arguments.length) {
				return this._totalTime;
			}
			if (this._timeline) {
				if (time < 0 && !uncapped) {
					time += this.totalDuration();
				}
				if (this._timeline.smoothChildTiming) {
					if (this._dirty) {
						this.totalDuration();
					}
					var totalDuration = this._totalDuration,
						tl = this._timeline;
					if (time > totalDuration && !uncapped) {
						time = totalDuration;
					}
					this._startTime = (this._paused ? this._pauseTime : tl._time) - ((!this._reversed ? time : totalDuration - time) / this._timeScale);
					if (!tl._dirty) { //for performance improvement. If the parent's cache is already dirty, it already took care of marking the ancestors as dirty too, so skip the function call here.
						this._uncache(false);
					}
					//in case any of the ancestor timelines had completed but should now be enabled, we should reset their totalTime() which will also ensure that they're lined up properly and enabled. Skip for animations that are on the root (wasteful). Example: a TimelineLite.exportRoot() is performed when there's a paused tween on the root, the export will not complete until that tween is unpaused, but imagine a child gets restarted later, after all [unpaused] tweens have completed. The startTime of that child would get pushed out, but one of the ancestors may have completed.
					if (tl._timeline) {
						while (tl._timeline) {
							if (tl._timeline._time !== (tl._startTime + tl._totalTime) / tl._timeScale) {
								tl.totalTime(tl._totalTime, true);
							}
							tl = tl._timeline;
						}
					}
				}
				if (this._gc) {
					this._enabled(true, false);
				}
				if (this._totalTime !== time || this._duration === 0) {
					if (_lazyTweens.length) {
						_lazyRender();
					}
					this.render(time, suppressEvents, false);
					if (_lazyTweens.length) { //in case rendering caused any tweens to lazy-init, we should render them because typically when someone calls seek() or time() or progress(), they expect an immediate render.
						_lazyRender();
					}
				}
			}
			return this;
		};

		p.progress = p.totalProgress = function(value, suppressEvents) {
			var duration = this.duration();
			return (!arguments.length) ? (duration ? this._time / duration : this.ratio) : this.totalTime(duration * value, suppressEvents);
		};

		p.startTime = function(value) {
			if (!arguments.length) {
				return this._startTime;
			}
			if (value !== this._startTime) {
				this._startTime = value;
				if (this.timeline) if (this.timeline._sortChildren) {
					this.timeline.add(this, value - this._delay); //ensures that any necessary re-sequencing of Animations in the timeline occurs to make sure the rendering order is correct.
				}
			}
			return this;
		};

		p.endTime = function(includeRepeats) {
			return this._startTime + ((includeRepeats != false) ? this.totalDuration() : this.duration()) / this._timeScale;
		};

		p.timeScale = function(value) {
			if (!arguments.length) {
				return this._timeScale;
			}
			value = value || _tinyNum; //can't allow zero because it'll throw the math off
			if (this._timeline && this._timeline.smoothChildTiming) {
				var pauseTime = this._pauseTime,
					t = (pauseTime || pauseTime === 0) ? pauseTime : this._timeline.totalTime();
				this._startTime = t - ((t - this._startTime) * this._timeScale / value);
			}
			this._timeScale = value;
			return this._uncache(false);
		};

		p.reversed = function(value) {
			if (!arguments.length) {
				return this._reversed;
			}
			if (value != this._reversed) {
				this._reversed = value;
				this.totalTime(((this._timeline && !this._timeline.smoothChildTiming) ? this.totalDuration() - this._totalTime : this._totalTime), true);
			}
			return this;
		};

		p.paused = function(value) {
			if (!arguments.length) {
				return this._paused;
			}
			var tl = this._timeline,
				raw, elapsed;
			if (value != this._paused) if (tl) {
				if (!_tickerActive && !value) {
					_ticker.wake();
				}
				raw = tl.rawTime();
				elapsed = raw - this._pauseTime;
				if (!value && tl.smoothChildTiming) {
					this._startTime += elapsed;
					this._uncache(false);
				}
				this._pauseTime = value ? raw : null;
				this._paused = value;
				this._active = this.isActive();
				if (!value && elapsed !== 0 && this._initted && this.duration()) {
					raw = tl.smoothChildTiming ? this._totalTime : (raw - this._startTime) / this._timeScale;
					this.render(raw, (raw === this._totalTime), true); //in case the target's properties changed via some other tween or manual update by the user, we should force a render.
				}
			}
			if (this._gc && !value) {
				this._enabled(true, false);
			}
			return this;
		};


/*
 * ----------------------------------------------------------------
 * SimpleTimeline
 * ----------------------------------------------------------------
 */
		var SimpleTimeline = _class("core.SimpleTimeline", function(vars) {
			Animation.call(this, 0, vars);
			this.autoRemoveChildren = this.smoothChildTiming = true;
		});

		p = SimpleTimeline.prototype = new Animation();
		p.constructor = SimpleTimeline;
		p.kill()._gc = false;
		p._first = p._last = p._recent = null;
		p._sortChildren = false;

		p.add = p.insert = function(child, position, align, stagger) {
			var prevTween, st;
			child._startTime = Number(position || 0) + child._delay;
			if (child._paused) if (this !== child._timeline) { //we only adjust the _pauseTime if it wasn't in this timeline already. Remember, sometimes a tween will be inserted again into the same timeline when its startTime is changed so that the tweens in the TimelineLite/Max are re-ordered properly in the linked list (so everything renders in the proper order).
				child._pauseTime = child._startTime + ((this.rawTime() - child._startTime) / child._timeScale);
			}
			if (child.timeline) {
				child.timeline._remove(child, true); //removes from existing timeline so that it can be properly added to this one.
			}
			child.timeline = child._timeline = this;
			if (child._gc) {
				child._enabled(true, true);
			}
			prevTween = this._last;
			if (this._sortChildren) {
				st = child._startTime;
				while (prevTween && prevTween._startTime > st) {
					prevTween = prevTween._prev;
				}
			}
			if (prevTween) {
				child._next = prevTween._next;
				prevTween._next = child;
			} else {
				child._next = this._first;
				this._first = child;
			}
			if (child._next) {
				child._next._prev = child;
			} else {
				this._last = child;
			}
			child._prev = prevTween;
			this._recent = child;
			if (this._timeline) {
				this._uncache(true);
			}
			return this;
		};

		p._remove = function(tween, skipDisable) {
			if (tween.timeline === this) {
				if (!skipDisable) {
					tween._enabled(false, true);
				}

				if (tween._prev) {
					tween._prev._next = tween._next;
				} else if (this._first === tween) {
					this._first = tween._next;
				}
				if (tween._next) {
					tween._next._prev = tween._prev;
				} else if (this._last === tween) {
					this._last = tween._prev;
				}
				tween._next = tween._prev = tween.timeline = null;
				if (tween === this._recent) {
					this._recent = this._last;
				}

				if (this._timeline) {
					this._uncache(true);
				}
			}
			return this;
		};

		p.render = function(time, suppressEvents, force) {
			var tween = this._first,
				next;
			this._totalTime = this._time = this._rawPrevTime = time;
			while (tween) {
				next = tween._next; //record it here because the value could change after rendering...
				if (tween._active || (time >= tween._startTime && !tween._paused)) {
					if (!tween._reversed) {
						tween.render((time - tween._startTime) * tween._timeScale, suppressEvents, force);
					} else {
						tween.render(((!tween._dirty) ? tween._totalDuration : tween.totalDuration()) - ((time - tween._startTime) * tween._timeScale), suppressEvents, force);
					}
				}
				tween = next;
			}
		};

		p.rawTime = function() {
			if (!_tickerActive) {
				_ticker.wake();
			}
			return this._totalTime;
		};

/*
 * ----------------------------------------------------------------
 * TweenLite
 * ----------------------------------------------------------------
 */
		var TweenLite = _class("TweenLite", function(target, duration, vars) {
				Animation.call(this, duration, vars);
				this.render = TweenLite.prototype.render; //speed optimization (avoid prototype lookup on this "hot" method)

				if (target == null) {
					throw "Cannot tween a null target.";
				}

				this.target = target = (typeof(target) !== "string") ? target : TweenLite.selector(target) || target;

				var isSelector = (target.jquery || (target.length && target !== window && target[0] && (target[0] === window || (target[0].nodeType && target[0].style && !target.nodeType)))),
					overwrite = this.vars.overwrite,
					i, targ, targets;

				this._overwrite = overwrite = (overwrite == null) ? _overwriteLookup[TweenLite.defaultOverwrite] : (typeof(overwrite) === "number") ? overwrite >> 0 : _overwriteLookup[overwrite];

				if ((isSelector || target instanceof Array || (target.push && _isArray(target))) && typeof(target[0]) !== "number") {
					this._targets = targets = _slice(target);  //don't use Array.prototype.slice.call(target, 0) because that doesn't work in IE8 with a NodeList that's returned by querySelectorAll()
					this._propLookup = [];
					this._siblings = [];
					for (i = 0; i < targets.length; i++) {
						targ = targets[i];
						if (!targ) {
							targets.splice(i--, 1);
							continue;
						} else if (typeof(targ) === "string") {
							targ = targets[i--] = TweenLite.selector(targ); //in case it's an array of strings
							if (typeof(targ) === "string") {
								targets.splice(i+1, 1); //to avoid an endless loop (can't imagine why the selector would return a string, but just in case)
							}
							continue;
						} else if (targ.length && targ !== window && targ[0] && (targ[0] === window || (targ[0].nodeType && targ[0].style && !targ.nodeType))) { //in case the user is passing in an array of selector objects (like jQuery objects), we need to check one more level and pull things out if necessary. Also note that <select> elements pass all the criteria regarding length and the first child having style, so we must also check to ensure the target isn't an HTML node itself.
							targets.splice(i--, 1);
							this._targets = targets = targets.concat(_slice(targ));
							continue;
						}
						this._siblings[i] = _register(targ, this, false);
						if (overwrite === 1) if (this._siblings[i].length > 1) {
							_applyOverwrite(targ, this, null, 1, this._siblings[i]);
						}
					}

				} else {
					this._propLookup = {};
					this._siblings = _register(target, this, false);
					if (overwrite === 1) if (this._siblings.length > 1) {
						_applyOverwrite(target, this, null, 1, this._siblings);
					}
				}
				if (this.vars.immediateRender || (duration === 0 && this._delay === 0 && this.vars.immediateRender !== false)) {
					this._time = -_tinyNum; //forces a render without having to set the render() "force" parameter to true because we want to allow lazying by default (using the "force" parameter always forces an immediate full render)
					this.render(-this._delay);
				}
			}, true),
			_isSelector = function(v) {
				return (v && v.length && v !== window && v[0] && (v[0] === window || (v[0].nodeType && v[0].style && !v.nodeType))); //we cannot check "nodeType" if the target is window from within an iframe, otherwise it will trigger a security error in some browsers like Firefox.
			},
			_autoCSS = function(vars, target) {
				var css = {},
					p;
				for (p in vars) {
					if (!_reservedProps[p] && (!(p in target) || p === "transform" || p === "x" || p === "y" || p === "width" || p === "height" || p === "className" || p === "border") && (!_plugins[p] || (_plugins[p] && _plugins[p]._autoCSS))) { //note: <img> elements contain read-only "x" and "y" properties. We should also prioritize editing css width/height rather than the element's properties.
						css[p] = vars[p];
						delete vars[p];
					}
				}
				vars.css = css;
			};

		p = TweenLite.prototype = new Animation();
		p.constructor = TweenLite;
		p.kill()._gc = false;

//----TweenLite defaults, overwrite management, and root updates ----------------------------------------------------

		p.ratio = 0;
		p._firstPT = p._targets = p._overwrittenProps = p._startAt = null;
		p._notifyPluginsOfEnabled = p._lazy = false;

		TweenLite.version = "1.18.0";
		TweenLite.defaultEase = p._ease = new Ease(null, null, 1, 1);
		TweenLite.defaultOverwrite = "auto";
		TweenLite.ticker = _ticker;
		TweenLite.autoSleep = 120;
		TweenLite.lagSmoothing = function(threshold, adjustedLag) {
			_ticker.lagSmoothing(threshold, adjustedLag);
		};

		TweenLite.selector = window.$ || window.jQuery || function(e) {
			var selector = window.$ || window.jQuery;
			if (selector) {
				TweenLite.selector = selector;
				return selector(e);
			}
			return (typeof(document) === "undefined") ? e : (document.querySelectorAll ? document.querySelectorAll(e) : document.getElementById((e.charAt(0) === "#") ? e.substr(1) : e));
		};

		var _lazyTweens = [],
			_lazyLookup = {},
			_numbersExp = /(?:(-|-=|\+=)?\d*\.?\d*(?:e[\-+]?\d+)?)[0-9]/ig,
			//_nonNumbersExp = /(?:([\-+](?!(\d|=)))|[^\d\-+=e]|(e(?![\-+][\d])))+/ig,
			_setRatio = function(v) {
				var pt = this._firstPT,
					min = 0.000001,
					val;
				while (pt) {
					val = !pt.blob ? pt.c * v + pt.s : v ? this.join("") : this.start;
					if (pt.r) {
						val = Math.round(val);
					} else if (val < min) if (val > -min) { //prevents issues with converting very small numbers to strings in the browser
						val = 0;
					}
					if (!pt.f) {
						pt.t[pt.p] = val;
					} else if (pt.fp) {
						pt.t[pt.p](pt.fp, val);
					} else {
						pt.t[pt.p](val);
					}
					pt = pt._next;
				}
			},
			//compares two strings (start/end), finds the numbers that are different and spits back an array representing the whole value but with the changing values isolated as elements. For example, "rgb(0,0,0)" and "rgb(100,50,0)" would become ["rgb(", 0, ",", 50, ",0)"]. Notice it merges the parts that are identical (performance optimization). The array also has a linked list of PropTweens attached starting with _firstPT that contain the tweening data (t, p, s, c, f, etc.). It also stores the starting value as a "start" property so that we can revert to it if/when necessary, like when a tween rewinds fully. If the quantity of numbers differs between the start and end, it will always prioritize the end value(s). The pt parameter is optional - it's for a PropTween that will be appended to the end of the linked list and is typically for actually setting the value after all of the elements have been updated (with array.join("")).
			_blobDif = function(start, end, filter, pt) {
				var a = [start, end],
					charIndex = 0,
					s = "",
					color = 0,
					startNums, endNums, num, i, l, nonNumbers, currentNum;
				a.start = start;
				if (filter) {
					filter(a); //pass an array with the starting and ending values and let the filter do whatever it needs to the values.
					start = a[0];
					end = a[1];
				}
				a.length = 0;
				startNums = start.match(_numbersExp) || [];
				endNums = end.match(_numbersExp) || [];
				if (pt) {
					pt._next = null;
					pt.blob = 1;
					a._firstPT = pt; //apply last in the linked list (which means inserting it first)
				}
				l = endNums.length;
				for (i = 0; i < l; i++) {
					currentNum = endNums[i];
					nonNumbers = end.substr(charIndex, end.indexOf(currentNum, charIndex)-charIndex);
					s += (nonNumbers || !i) ? nonNumbers : ","; //note: SVG spec allows omission of comma/space when a negative sign is wedged between two numbers, like 2.5-5.3 instead of 2.5,-5.3 but when tweening, the negative value may switch to positive, so we insert the comma just in case.
					charIndex += nonNumbers.length;
					if (color) { //sense rgba() values and round them.
						color = (color + 1) % 5;
					} else if (nonNumbers.substr(-5) === "rgba(") {
						color = 1;
					}
					if (currentNum === startNums[i] || startNums.length <= i) {
						s += currentNum;
					} else {
						if (s) {
							a.push(s);
							s = "";
						}
						num = parseFloat(startNums[i]);
						a.push(num);
						a._firstPT = {_next: a._firstPT, t:a, p: a.length-1, s:num, c:((currentNum.charAt(1) === "=") ? parseInt(currentNum.charAt(0) + "1", 10) * parseFloat(currentNum.substr(2)) : (parseFloat(currentNum) - num)) || 0, f:0, r:(color && color < 4)};
						//note: we don't set _prev because we'll never need to remove individual PropTweens from this list.
					}
					charIndex += currentNum.length;
				}
				s += end.substr(charIndex);
				if (s) {
					a.push(s);
				}
				a.setRatio = _setRatio;
				return a;
			},
			//note: "funcParam" is only necessary for function-based getters/setters that require an extra parameter like getAttribute("width") and setAttribute("width", value). In this example, funcParam would be "width". Used by AttrPlugin for example.
			_addPropTween = function(target, prop, start, end, overwriteProp, round, funcParam, stringFilter) {
				var s = (start === "get") ? target[prop] : start,
					type = typeof(target[prop]),
					isRelative = (typeof(end) === "string" && end.charAt(1) === "="),
					pt = {t:target, p:prop, s:s, f:(type === "function"), pg:0, n:overwriteProp || prop, r:round, pr:0, c:isRelative ? parseInt(end.charAt(0) + "1", 10) * parseFloat(end.substr(2)) : (parseFloat(end) - s) || 0},
					blob, getterName;
				if (type !== "number") {
					if (type === "function" && start === "get") {
						getterName = ((prop.indexOf("set") || typeof(target["get" + prop.substr(3)]) !== "function") ? prop : "get" + prop.substr(3));
						pt.s = s = funcParam ? target[getterName](funcParam) : target[getterName]();
					}
					if (typeof(s) === "string" && (funcParam || isNaN(s))) {
						//a blob (string that has multiple numbers in it)
						pt.fp = funcParam;
						blob = _blobDif(s, end, stringFilter || TweenLite.defaultStringFilter, pt);
						pt = {t:blob, p:"setRatio", s:0, c:1, f:2, pg:0, n:overwriteProp || prop, pr:0}; //"2" indicates it's a Blob property tween. Needed for RoundPropsPlugin for example.
					} else if (!isRelative) {
						pt.c = (parseFloat(end) - parseFloat(s)) || 0;
					}
				}
				if (pt.c) { //only add it to the linked list if there's a change.
					if ((pt._next = this._firstPT)) {
						pt._next._prev = pt;
					}
					this._firstPT = pt;
					return pt;
				}
			},
			_internals = TweenLite._internals = {isArray:_isArray, isSelector:_isSelector, lazyTweens:_lazyTweens, blobDif:_blobDif}, //gives us a way to expose certain private values to other GreenSock classes without contaminating tha main TweenLite object.
			_plugins = TweenLite._plugins = {},
			_tweenLookup = _internals.tweenLookup = {},
			_tweenLookupNum = 0,
			_reservedProps = _internals.reservedProps = {ease:1, delay:1, overwrite:1, onComplete:1, onCompleteParams:1, onCompleteScope:1, useFrames:1, runBackwards:1, startAt:1, onUpdate:1, onUpdateParams:1, onUpdateScope:1, onStart:1, onStartParams:1, onStartScope:1, onReverseComplete:1, onReverseCompleteParams:1, onReverseCompleteScope:1, onRepeat:1, onRepeatParams:1, onRepeatScope:1, easeParams:1, yoyo:1, immediateRender:1, repeat:1, repeatDelay:1, data:1, paused:1, reversed:1, autoCSS:1, lazy:1, onOverwrite:1, callbackScope:1, stringFilter:1},
			_overwriteLookup = {none:0, all:1, auto:2, concurrent:3, allOnStart:4, preexisting:5, "true":1, "false":0},
			_rootFramesTimeline = Animation._rootFramesTimeline = new SimpleTimeline(),
			_rootTimeline = Animation._rootTimeline = new SimpleTimeline(),
			_nextGCFrame = 30,
			_lazyRender = _internals.lazyRender = function() {
				var i = _lazyTweens.length,
					tween;
				_lazyLookup = {};
				while (--i > -1) {
					tween = _lazyTweens[i];
					if (tween && tween._lazy !== false) {
						tween.render(tween._lazy[0], tween._lazy[1], true);
						tween._lazy = false;
					}
				}
				_lazyTweens.length = 0;
			};

		_rootTimeline._startTime = _ticker.time;
		_rootFramesTimeline._startTime = _ticker.frame;
		_rootTimeline._active = _rootFramesTimeline._active = true;
		setTimeout(_lazyRender, 1); //on some mobile devices, there isn't a "tick" before code runs which means any lazy renders wouldn't run before the next official "tick".

		Animation._updateRoot = TweenLite.render = function() {
				var i, a, p;
				if (_lazyTweens.length) { //if code is run outside of the requestAnimationFrame loop, there may be tweens queued AFTER the engine refreshed, so we need to ensure any pending renders occur before we refresh again.
					_lazyRender();
				}
				_rootTimeline.render((_ticker.time - _rootTimeline._startTime) * _rootTimeline._timeScale, false, false);
				_rootFramesTimeline.render((_ticker.frame - _rootFramesTimeline._startTime) * _rootFramesTimeline._timeScale, false, false);
				if (_lazyTweens.length) {
					_lazyRender();
				}
				if (_ticker.frame >= _nextGCFrame) { //dump garbage every 120 frames or whatever the user sets TweenLite.autoSleep to
					_nextGCFrame = _ticker.frame + (parseInt(TweenLite.autoSleep, 10) || 120);
					for (p in _tweenLookup) {
						a = _tweenLookup[p].tweens;
						i = a.length;
						while (--i > -1) {
							if (a[i]._gc) {
								a.splice(i, 1);
							}
						}
						if (a.length === 0) {
							delete _tweenLookup[p];
						}
					}
					//if there are no more tweens in the root timelines, or if they're all paused, make the _timer sleep to reduce load on the CPU slightly
					p = _rootTimeline._first;
					if (!p || p._paused) if (TweenLite.autoSleep && !_rootFramesTimeline._first && _ticker._listeners.tick.length === 1) {
						while (p && p._paused) {
							p = p._next;
						}
						if (!p) {
							_ticker.sleep();
						}
					}
				}
			};

		_ticker.addEventListener("tick", Animation._updateRoot);

		var _register = function(target, tween, scrub) {
				var id = target._gsTweenID, a, i;
				if (!_tweenLookup[id || (target._gsTweenID = id = "t" + (_tweenLookupNum++))]) {
					_tweenLookup[id] = {target:target, tweens:[]};
				}
				if (tween) {
					a = _tweenLookup[id].tweens;
					a[(i = a.length)] = tween;
					if (scrub) {
						while (--i > -1) {
							if (a[i] === tween) {
								a.splice(i, 1);
							}
						}
					}
				}
				return _tweenLookup[id].tweens;
			},
			_onOverwrite = function(overwrittenTween, overwritingTween, target, killedProps) {
				var func = overwrittenTween.vars.onOverwrite, r1, r2;
				if (func) {
					r1 = func(overwrittenTween, overwritingTween, target, killedProps);
				}
				func = TweenLite.onOverwrite;
				if (func) {
					r2 = func(overwrittenTween, overwritingTween, target, killedProps);
				}
				return (r1 !== false && r2 !== false);
			},
			_applyOverwrite = function(target, tween, props, mode, siblings) {
				var i, changed, curTween, l;
				if (mode === 1 || mode >= 4) {
					l = siblings.length;
					for (i = 0; i < l; i++) {
						if ((curTween = siblings[i]) !== tween) {
							if (!curTween._gc) {
								if (curTween._kill(null, target, tween)) {
									changed = true;
								}
							}
						} else if (mode === 5) {
							break;
						}
					}
					return changed;
				}
				//NOTE: Add 0.0000000001 to overcome floating point errors that can cause the startTime to be VERY slightly off (when a tween's time() is set for example)
				var startTime = tween._startTime + _tinyNum,
					overlaps = [],
					oCount = 0,
					zeroDur = (tween._duration === 0),
					globalStart;
				i = siblings.length;
				while (--i > -1) {
					if ((curTween = siblings[i]) === tween || curTween._gc || curTween._paused) {
						//ignore
					} else if (curTween._timeline !== tween._timeline) {
						globalStart = globalStart || _checkOverlap(tween, 0, zeroDur);
						if (_checkOverlap(curTween, globalStart, zeroDur) === 0) {
							overlaps[oCount++] = curTween;
						}
					} else if (curTween._startTime <= startTime) if (curTween._startTime + curTween.totalDuration() / curTween._timeScale > startTime) if (!((zeroDur || !curTween._initted) && startTime - curTween._startTime <= 0.0000000002)) {
						overlaps[oCount++] = curTween;
					}
				}

				i = oCount;
				while (--i > -1) {
					curTween = overlaps[i];
					if (mode === 2) if (curTween._kill(props, target, tween)) {
						changed = true;
					}
					if (mode !== 2 || (!curTween._firstPT && curTween._initted)) {
						if (mode !== 2 && !_onOverwrite(curTween, tween)) {
							continue;
						}
						if (curTween._enabled(false, false)) { //if all property tweens have been overwritten, kill the tween.
							changed = true;
						}
					}
				}
				return changed;
			},
			_checkOverlap = function(tween, reference, zeroDur) {
				var tl = tween._timeline,
					ts = tl._timeScale,
					t = tween._startTime;
				while (tl._timeline) {
					t += tl._startTime;
					ts *= tl._timeScale;
					if (tl._paused) {
						return -100;
					}
					tl = tl._timeline;
				}
				t /= ts;
				return (t > reference) ? t - reference : ((zeroDur && t === reference) || (!tween._initted && t - reference < 2 * _tinyNum)) ? _tinyNum : ((t += tween.totalDuration() / tween._timeScale / ts) > reference + _tinyNum) ? 0 : t - reference - _tinyNum;
			};


//---- TweenLite instance methods -----------------------------------------------------------------------------

		p._init = function() {
			var v = this.vars,
				op = this._overwrittenProps,
				dur = this._duration,
				immediate = !!v.immediateRender,
				ease = v.ease,
				i, initPlugins, pt, p, startVars;
			if (v.startAt) {
				if (this._startAt) {
					this._startAt.render(-1, true); //if we've run a startAt previously (when the tween instantiated), we should revert it so that the values re-instantiate correctly particularly for relative tweens. Without this, a TweenLite.fromTo(obj, 1, {x:"+=100"}, {x:"-=100"}), for example, would actually jump to +=200 because the startAt would run twice, doubling the relative change.
					this._startAt.kill();
				}
				startVars = {};
				for (p in v.startAt) { //copy the properties/values into a new object to avoid collisions, like var to = {x:0}, from = {x:500}; timeline.fromTo(e, 1, from, to).fromTo(e, 1, to, from);
					startVars[p] = v.startAt[p];
				}
				startVars.overwrite = false;
				startVars.immediateRender = true;
				startVars.lazy = (immediate && v.lazy !== false);
				startVars.startAt = startVars.delay = null; //no nesting of startAt objects allowed (otherwise it could cause an infinite loop).
				this._startAt = TweenLite.to(this.target, 0, startVars);
				if (immediate) {
					if (this._time > 0) {
						this._startAt = null; //tweens that render immediately (like most from() and fromTo() tweens) shouldn't revert when their parent timeline's playhead goes backward past the startTime because the initial render could have happened anytime and it shouldn't be directly correlated to this tween's startTime. Imagine setting up a complex animation where the beginning states of various objects are rendered immediately but the tween doesn't happen for quite some time - if we revert to the starting values as soon as the playhead goes backward past the tween's startTime, it will throw things off visually. Reversion should only happen in TimelineLite/Max instances where immediateRender was false (which is the default in the convenience methods like from()).
					} else if (dur !== 0) {
						return; //we skip initialization here so that overwriting doesn't occur until the tween actually begins. Otherwise, if you create several immediateRender:true tweens of the same target/properties to drop into a TimelineLite or TimelineMax, the last one created would overwrite the first ones because they didn't get placed into the timeline yet before the first render occurs and kicks in overwriting.
					}
				}
			} else if (v.runBackwards && dur !== 0) {
				//from() tweens must be handled uniquely: their beginning values must be rendered but we don't want overwriting to occur yet (when time is still 0). Wait until the tween actually begins before doing all the routines like overwriting. At that time, we should render at the END of the tween to ensure that things initialize correctly (remember, from() tweens go backwards)
				if (this._startAt) {
					this._startAt.render(-1, true);
					this._startAt.kill();
					this._startAt = null;
				} else {
					if (this._time !== 0) { //in rare cases (like if a from() tween runs and then is invalidate()-ed), immediateRender could be true but the initial forced-render gets skipped, so there's no need to force the render in this context when the _time is greater than 0
						immediate = false;
					}
					pt = {};
					for (p in v) { //copy props into a new object and skip any reserved props, otherwise onComplete or onUpdate or onStart could fire. We should, however, permit autoCSS to go through.
						if (!_reservedProps[p] || p === "autoCSS") {
							pt[p] = v[p];
						}
					}
					pt.overwrite = 0;
					pt.data = "isFromStart"; //we tag the tween with as "isFromStart" so that if [inside a plugin] we need to only do something at the very END of a tween, we have a way of identifying this tween as merely the one that's setting the beginning values for a "from()" tween. For example, clearProps in CSSPlugin should only get applied at the very END of a tween and without this tag, from(...{height:100, clearProps:"height", delay:1}) would wipe the height at the beginning of the tween and after 1 second, it'd kick back in.
					pt.lazy = (immediate && v.lazy !== false);
					pt.immediateRender = immediate; //zero-duration tweens render immediately by default, but if we're not specifically instructed to render this tween immediately, we should skip this and merely _init() to record the starting values (rendering them immediately would push them to completion which is wasteful in that case - we'd have to render(-1) immediately after)
					this._startAt = TweenLite.to(this.target, 0, pt);
					if (!immediate) {
						this._startAt._init(); //ensures that the initial values are recorded
						this._startAt._enabled(false); //no need to have the tween render on the next cycle. Disable it because we'll always manually control the renders of the _startAt tween.
						if (this.vars.immediateRender) {
							this._startAt = null;
						}
					} else if (this._time === 0) {
						return;
					}
				}
			}
			this._ease = ease = (!ease) ? TweenLite.defaultEase : (ease instanceof Ease) ? ease : (typeof(ease) === "function") ? new Ease(ease, v.easeParams) : _easeMap[ease] || TweenLite.defaultEase;
			if (v.easeParams instanceof Array && ease.config) {
				this._ease = ease.config.apply(ease, v.easeParams);
			}
			this._easeType = this._ease._type;
			this._easePower = this._ease._power;
			this._firstPT = null;

			if (this._targets) {
				i = this._targets.length;
				while (--i > -1) {
					if ( this._initProps( this._targets[i], (this._propLookup[i] = {}), this._siblings[i], (op ? op[i] : null)) ) {
						initPlugins = true;
					}
				}
			} else {
				initPlugins = this._initProps(this.target, this._propLookup, this._siblings, op);
			}

			if (initPlugins) {
				TweenLite._onPluginEvent("_onInitAllProps", this); //reorders the array in order of priority. Uses a static TweenPlugin method in order to minimize file size in TweenLite
			}
			if (op) if (!this._firstPT) if (typeof(this.target) !== "function") { //if all tweening properties have been overwritten, kill the tween. If the target is a function, it's probably a delayedCall so let it live.
				this._enabled(false, false);
			}
			if (v.runBackwards) {
				pt = this._firstPT;
				while (pt) {
					pt.s += pt.c;
					pt.c = -pt.c;
					pt = pt._next;
				}
			}
			this._onUpdate = v.onUpdate;
			this._initted = true;
		};

		p._initProps = function(target, propLookup, siblings, overwrittenProps) {
			var p, i, initPlugins, plugin, pt, v;
			if (target == null) {
				return false;
			}

			if (_lazyLookup[target._gsTweenID]) {
				_lazyRender(); //if other tweens of the same target have recently initted but haven't rendered yet, we've got to force the render so that the starting values are correct (imagine populating a timeline with a bunch of sequential tweens and then jumping to the end)
			}

			if (!this.vars.css) if (target.style) if (target !== window && target.nodeType) if (_plugins.css) if (this.vars.autoCSS !== false) { //it's so common to use TweenLite/Max to animate the css of DOM elements, we assume that if the target is a DOM element, that's what is intended (a convenience so that users don't have to wrap things in css:{}, although we still recommend it for a slight performance boost and better specificity). Note: we cannot check "nodeType" on the window inside an iframe.
				_autoCSS(this.vars, target);
			}
			for (p in this.vars) {
				v = this.vars[p];
				if (_reservedProps[p]) {
					if (v) if ((v instanceof Array) || (v.push && _isArray(v))) if (v.join("").indexOf("{self}") !== -1) {
						this.vars[p] = v = this._swapSelfInParams(v, this);
					}

				} else if (_plugins[p] && (plugin = new _plugins[p]())._onInitTween(target, this.vars[p], this)) {

					//t - target 		[object]
					//p - property 		[string]
					//s - start			[number]
					//c - change		[number]
					//f - isFunction	[boolean]
					//n - name			[string]
					//pg - isPlugin 	[boolean]
					//pr - priority		[number]
					this._firstPT = pt = {_next:this._firstPT, t:plugin, p:"setRatio", s:0, c:1, f:1, n:p, pg:1, pr:plugin._priority};
					i = plugin._overwriteProps.length;
					while (--i > -1) {
						propLookup[plugin._overwriteProps[i]] = this._firstPT;
					}
					if (plugin._priority || plugin._onInitAllProps) {
						initPlugins = true;
					}
					if (plugin._onDisable || plugin._onEnable) {
						this._notifyPluginsOfEnabled = true;
					}
					if (pt._next) {
						pt._next._prev = pt;
					}

				} else {
					propLookup[p] = _addPropTween.call(this, target, p, "get", v, p, 0, null, this.vars.stringFilter);
				}
			}

			if (overwrittenProps) if (this._kill(overwrittenProps, target)) { //another tween may have tried to overwrite properties of this tween before init() was called (like if two tweens start at the same time, the one created second will run first)
				return this._initProps(target, propLookup, siblings, overwrittenProps);
			}
			if (this._overwrite > 1) if (this._firstPT) if (siblings.length > 1) if (_applyOverwrite(target, this, propLookup, this._overwrite, siblings)) {
				this._kill(propLookup, target);
				return this._initProps(target, propLookup, siblings, overwrittenProps);
			}
			if (this._firstPT) if ((this.vars.lazy !== false && this._duration) || (this.vars.lazy && !this._duration)) { //zero duration tweens don't lazy render by default; everything else does.
				_lazyLookup[target._gsTweenID] = true;
			}
			return initPlugins;
		};

		p.render = function(time, suppressEvents, force) {
			var prevTime = this._time,
				duration = this._duration,
				prevRawPrevTime = this._rawPrevTime,
				isComplete, callback, pt, rawPrevTime;
			if (time >= duration) {
				this._totalTime = this._time = duration;
				this.ratio = this._ease._calcEnd ? this._ease.getRatio(1) : 1;
				if (!this._reversed ) {
					isComplete = true;
					callback = "onComplete";
					force = (force || this._timeline.autoRemoveChildren); //otherwise, if the animation is unpaused/activated after it's already finished, it doesn't get removed from the parent timeline.
				}
				if (duration === 0) if (this._initted || !this.vars.lazy || force) { //zero-duration tweens are tricky because we must discern the momentum/direction of time in order to determine whether the starting values should be rendered or the ending values. If the "playhead" of its timeline goes past the zero-duration tween in the forward direction or lands directly on it, the end values should be rendered, but if the timeline's "playhead" moves past it in the backward direction (from a postitive time to a negative time), the starting values must be rendered.
					if (this._startTime === this._timeline._duration) { //if a zero-duration tween is at the VERY end of a timeline and that timeline renders at its end, it will typically add a tiny bit of cushion to the render time to prevent rounding errors from getting in the way of tweens rendering their VERY end. If we then reverse() that timeline, the zero-duration tween will trigger its onReverseComplete even though technically the playhead didn't pass over it again. It's a very specific edge case we must accommodate.
						time = 0;
					}
					if (time === 0 || prevRawPrevTime < 0 || (prevRawPrevTime === _tinyNum && this.data !== "isPause")) if (prevRawPrevTime !== time) { //note: when this.data is "isPause", it's a callback added by addPause() on a timeline that we should not be triggered when LEAVING its exact start time. In other words, tl.addPause(1).play(1) shouldn't pause.
						force = true;
						if (prevRawPrevTime > _tinyNum) {
							callback = "onReverseComplete";
						}
					}
					this._rawPrevTime = rawPrevTime = (!suppressEvents || time || prevRawPrevTime === time) ? time : _tinyNum; //when the playhead arrives at EXACTLY time 0 (right on top) of a zero-duration tween, we need to discern if events are suppressed so that when the playhead moves again (next time), it'll trigger the callback. If events are NOT suppressed, obviously the callback would be triggered in this render. Basically, the callback should fire either when the playhead ARRIVES or LEAVES this exact spot, not both. Imagine doing a timeline.seek(0) and there's a callback that sits at 0. Since events are suppressed on that seek() by default, nothing will fire, but when the playhead moves off of that position, the callback should fire. This behavior is what people intuitively expect. We set the _rawPrevTime to be a precise tiny number to indicate this scenario rather than using another property/variable which would increase memory usage. This technique is less readable, but more efficient.
				}

			} else if (time < 0.0000001) { //to work around occasional floating point math artifacts, round super small values to 0.
				this._totalTime = this._time = 0;
				this.ratio = this._ease._calcEnd ? this._ease.getRatio(0) : 0;
				if (prevTime !== 0 || (duration === 0 && prevRawPrevTime > 0)) {
					callback = "onReverseComplete";
					isComplete = this._reversed;
				}
				if (time < 0) {
					this._active = false;
					if (duration === 0) if (this._initted || !this.vars.lazy || force) { //zero-duration tweens are tricky because we must discern the momentum/direction of time in order to determine whether the starting values should be rendered or the ending values. If the "playhead" of its timeline goes past the zero-duration tween in the forward direction or lands directly on it, the end values should be rendered, but if the timeline's "playhead" moves past it in the backward direction (from a postitive time to a negative time), the starting values must be rendered.
						if (prevRawPrevTime >= 0 && !(prevRawPrevTime === _tinyNum && this.data === "isPause")) {
							force = true;
						}
						this._rawPrevTime = rawPrevTime = (!suppressEvents || time || prevRawPrevTime === time) ? time : _tinyNum; //when the playhead arrives at EXACTLY time 0 (right on top) of a zero-duration tween, we need to discern if events are suppressed so that when the playhead moves again (next time), it'll trigger the callback. If events are NOT suppressed, obviously the callback would be triggered in this render. Basically, the callback should fire either when the playhead ARRIVES or LEAVES this exact spot, not both. Imagine doing a timeline.seek(0) and there's a callback that sits at 0. Since events are suppressed on that seek() by default, nothing will fire, but when the playhead moves off of that position, the callback should fire. This behavior is what people intuitively expect. We set the _rawPrevTime to be a precise tiny number to indicate this scenario rather than using another property/variable which would increase memory usage. This technique is less readable, but more efficient.
					}
				}
				if (!this._initted) { //if we render the very beginning (time == 0) of a fromTo(), we must force the render (normal tweens wouldn't need to render at a time of 0 when the prevTime was also 0). This is also mandatory to make sure overwriting kicks in immediately.
					force = true;
				}
			} else {
				this._totalTime = this._time = time;

				if (this._easeType) {
					var r = time / duration, type = this._easeType, pow = this._easePower;
					if (type === 1 || (type === 3 && r >= 0.5)) {
						r = 1 - r;
					}
					if (type === 3) {
						r *= 2;
					}
					if (pow === 1) {
						r *= r;
					} else if (pow === 2) {
						r *= r * r;
					} else if (pow === 3) {
						r *= r * r * r;
					} else if (pow === 4) {
						r *= r * r * r * r;
					}

					if (type === 1) {
						this.ratio = 1 - r;
					} else if (type === 2) {
						this.ratio = r;
					} else if (time / duration < 0.5) {
						this.ratio = r / 2;
					} else {
						this.ratio = 1 - (r / 2);
					}

				} else {
					this.ratio = this._ease.getRatio(time / duration);
				}
			}

			if (this._time === prevTime && !force) {
				return;
			} else if (!this._initted) {
				this._init();
				if (!this._initted || this._gc) { //immediateRender tweens typically won't initialize until the playhead advances (_time is greater than 0) in order to ensure that overwriting occurs properly. Also, if all of the tweening properties have been overwritten (which would cause _gc to be true, as set in _init()), we shouldn't continue otherwise an onStart callback could be called for example.
					return;
				} else if (!force && this._firstPT && ((this.vars.lazy !== false && this._duration) || (this.vars.lazy && !this._duration))) {
					this._time = this._totalTime = prevTime;
					this._rawPrevTime = prevRawPrevTime;
					_lazyTweens.push(this);
					this._lazy = [time, suppressEvents];
					return;
				}
				//_ease is initially set to defaultEase, so now that init() has run, _ease is set properly and we need to recalculate the ratio. Overall this is faster than using conditional logic earlier in the method to avoid having to set ratio twice because we only init() once but renderTime() gets called VERY frequently.
				if (this._time && !isComplete) {
					this.ratio = this._ease.getRatio(this._time / duration);
				} else if (isComplete && this._ease._calcEnd) {
					this.ratio = this._ease.getRatio((this._time === 0) ? 0 : 1);
				}
			}
			if (this._lazy !== false) { //in case a lazy render is pending, we should flush it because the new render is occurring now (imagine a lazy tween instantiating and then immediately the user calls tween.seek(tween.duration()), skipping to the end - the end render would be forced, and then if we didn't flush the lazy render, it'd fire AFTER the seek(), rendering it at the wrong time.
				this._lazy = false;
			}
			if (!this._active) if (!this._paused && this._time !== prevTime && time >= 0) {
				this._active = true;  //so that if the user renders a tween (as opposed to the timeline rendering it), the timeline is forced to re-render and align it with the proper time/frame on the next rendering cycle. Maybe the tween already finished but the user manually re-renders it as halfway done.
			}
			if (prevTime === 0) {
				if (this._startAt) {
					if (time >= 0) {
						this._startAt.render(time, suppressEvents, force);
					} else if (!callback) {
						callback = "_dummyGS"; //if no callback is defined, use a dummy value just so that the condition at the end evaluates as true because _startAt should render AFTER the normal render loop when the time is negative. We could handle this in a more intuitive way, of course, but the render loop is the MOST important thing to optimize, so this technique allows us to avoid adding extra conditional logic in a high-frequency area.
					}
				}
				if (this.vars.onStart) if (this._time !== 0 || duration === 0) if (!suppressEvents) {
					this._callback("onStart");
				}
			}
			pt = this._firstPT;
			while (pt) {
				if (pt.f) {
					pt.t[pt.p](pt.c * this.ratio + pt.s);
				} else {
					pt.t[pt.p] = pt.c * this.ratio + pt.s;
				}
				pt = pt._next;
			}

			if (this._onUpdate) {
				if (time < 0) if (this._startAt && time !== -0.0001) { //if the tween is positioned at the VERY beginning (_startTime 0) of its parent timeline, it's illegal for the playhead to go back further, so we should not render the recorded startAt values.
					this._startAt.render(time, suppressEvents, force); //note: for performance reasons, we tuck this conditional logic inside less traveled areas (most tweens don't have an onUpdate). We'd just have it at the end before the onComplete, but the values should be updated before any onUpdate is called, so we ALSO put it here and then if it's not called, we do so later near the onComplete.
				}
				if (!suppressEvents) if (this._time !== prevTime || isComplete) {
					this._callback("onUpdate");
				}
			}
			if (callback) if (!this._gc || force) { //check _gc because there's a chance that kill() could be called in an onUpdate
				if (time < 0 && this._startAt && !this._onUpdate && time !== -0.0001) { //-0.0001 is a special value that we use when looping back to the beginning of a repeated TimelineMax, in which case we shouldn't render the _startAt values.
					this._startAt.render(time, suppressEvents, force);
				}
				if (isComplete) {
					if (this._timeline.autoRemoveChildren) {
						this._enabled(false, false);
					}
					this._active = false;
				}
				if (!suppressEvents && this.vars[callback]) {
					this._callback(callback);
				}
				if (duration === 0 && this._rawPrevTime === _tinyNum && rawPrevTime !== _tinyNum) { //the onComplete or onReverseComplete could trigger movement of the playhead and for zero-duration tweens (which must discern direction) that land directly back on their start time, we don't want to fire again on the next render. Think of several addPause()'s in a timeline that forces the playhead to a certain spot, but what if it's already paused and another tween is tweening the "time" of the timeline? Each time it moves [forward] past that spot, it would move back, and since suppressEvents is true, it'd reset _rawPrevTime to _tinyNum so that when it begins again, the callback would fire (so ultimately it could bounce back and forth during that tween). Again, this is a very uncommon scenario, but possible nonetheless.
					this._rawPrevTime = 0;
				}
			}
		};

		p._kill = function(vars, target, overwritingTween) {
			if (vars === "all") {
				vars = null;
			}
			if (vars == null) if (target == null || target === this.target) {
				this._lazy = false;
				return this._enabled(false, false);
			}
			target = (typeof(target) !== "string") ? (target || this._targets || this.target) : TweenLite.selector(target) || target;
			var simultaneousOverwrite = (overwritingTween && this._time && overwritingTween._startTime === this._startTime && this._timeline === overwritingTween._timeline),
				i, overwrittenProps, p, pt, propLookup, changed, killProps, record, killed;
			if ((_isArray(target) || _isSelector(target)) && typeof(target[0]) !== "number") {
				i = target.length;
				while (--i > -1) {
					if (this._kill(vars, target[i], overwritingTween)) {
						changed = true;
					}
				}
			} else {
				if (this._targets) {
					i = this._targets.length;
					while (--i > -1) {
						if (target === this._targets[i]) {
							propLookup = this._propLookup[i] || {};
							this._overwrittenProps = this._overwrittenProps || [];
							overwrittenProps = this._overwrittenProps[i] = vars ? this._overwrittenProps[i] || {} : "all";
							break;
						}
					}
				} else if (target !== this.target) {
					return false;
				} else {
					propLookup = this._propLookup;
					overwrittenProps = this._overwrittenProps = vars ? this._overwrittenProps || {} : "all";
				}

				if (propLookup) {
					killProps = vars || propLookup;
					record = (vars !== overwrittenProps && overwrittenProps !== "all" && vars !== propLookup && (typeof(vars) !== "object" || !vars._tempKill)); //_tempKill is a super-secret way to delete a particular tweening property but NOT have it remembered as an official overwritten property (like in BezierPlugin)
					if (overwritingTween && (TweenLite.onOverwrite || this.vars.onOverwrite)) {
						for (p in killProps) {
							if (propLookup[p]) {
								if (!killed) {
									killed = [];
								}
								killed.push(p);
							}
						}
						if ((killed || !vars) && !_onOverwrite(this, overwritingTween, target, killed)) { //if the onOverwrite returned false, that means the user wants to override the overwriting (cancel it).
							return false;
						}
					}

					for (p in killProps) {
						if ((pt = propLookup[p])) {
							if (simultaneousOverwrite) { //if another tween overwrites this one and they both start at exactly the same time, yet this tween has already rendered once (for example, at 0.001) because it's first in the queue, we should revert the values to where they were at 0 so that the starting values aren't contaminated on the overwriting tween.
								if (pt.f) {
									pt.t[pt.p](pt.s);
								} else {
									pt.t[pt.p] = pt.s;
								}
								changed = true;
							}
							if (pt.pg && pt.t._kill(killProps)) {
								changed = true; //some plugins need to be notified so they can perform cleanup tasks first
							}
							if (!pt.pg || pt.t._overwriteProps.length === 0) {
								if (pt._prev) {
									pt._prev._next = pt._next;
								} else if (pt === this._firstPT) {
									this._firstPT = pt._next;
								}
								if (pt._next) {
									pt._next._prev = pt._prev;
								}
								pt._next = pt._prev = null;
							}
							delete propLookup[p];
						}
						if (record) {
							overwrittenProps[p] = 1;
						}
					}
					if (!this._firstPT && this._initted) { //if all tweening properties are killed, kill the tween. Without this line, if there's a tween with multiple targets and then you killTweensOf() each target individually, the tween would technically still remain active and fire its onComplete even though there aren't any more properties tweening.
						this._enabled(false, false);
					}
				}
			}
			return changed;
		};

		p.invalidate = function() {
			if (this._notifyPluginsOfEnabled) {
				TweenLite._onPluginEvent("_onDisable", this);
			}
			this._firstPT = this._overwrittenProps = this._startAt = this._onUpdate = null;
			this._notifyPluginsOfEnabled = this._active = this._lazy = false;
			this._propLookup = (this._targets) ? {} : [];
			Animation.prototype.invalidate.call(this);
			if (this.vars.immediateRender) {
				this._time = -_tinyNum; //forces a render without having to set the render() "force" parameter to true because we want to allow lazying by default (using the "force" parameter always forces an immediate full render)
				this.render(-this._delay);
			}
			return this;
		};

		p._enabled = function(enabled, ignoreTimeline) {
			if (!_tickerActive) {
				_ticker.wake();
			}
			if (enabled && this._gc) {
				var targets = this._targets,
					i;
				if (targets) {
					i = targets.length;
					while (--i > -1) {
						this._siblings[i] = _register(targets[i], this, true);
					}
				} else {
					this._siblings = _register(this.target, this, true);
				}
			}
			Animation.prototype._enabled.call(this, enabled, ignoreTimeline);
			if (this._notifyPluginsOfEnabled) if (this._firstPT) {
				return TweenLite._onPluginEvent((enabled ? "_onEnable" : "_onDisable"), this);
			}
			return false;
		};


//----TweenLite static methods -----------------------------------------------------

		TweenLite.to = function(target, duration, vars) {
			return new TweenLite(target, duration, vars);
		};

		TweenLite.from = function(target, duration, vars) {
			vars.runBackwards = true;
			vars.immediateRender = (vars.immediateRender != false);
			return new TweenLite(target, duration, vars);
		};

		TweenLite.fromTo = function(target, duration, fromVars, toVars) {
			toVars.startAt = fromVars;
			toVars.immediateRender = (toVars.immediateRender != false && fromVars.immediateRender != false);
			return new TweenLite(target, duration, toVars);
		};

		TweenLite.delayedCall = function(delay, callback, params, scope, useFrames) {
			return new TweenLite(callback, 0, {delay:delay, onComplete:callback, onCompleteParams:params, callbackScope:scope, onReverseComplete:callback, onReverseCompleteParams:params, immediateRender:false, lazy:false, useFrames:useFrames, overwrite:0});
		};

		TweenLite.set = function(target, vars) {
			return new TweenLite(target, 0, vars);
		};

		TweenLite.getTweensOf = function(target, onlyActive) {
			if (target == null) { return []; }
			target = (typeof(target) !== "string") ? target : TweenLite.selector(target) || target;
			var i, a, j, t;
			if ((_isArray(target) || _isSelector(target)) && typeof(target[0]) !== "number") {
				i = target.length;
				a = [];
				while (--i > -1) {
					a = a.concat(TweenLite.getTweensOf(target[i], onlyActive));
				}
				i = a.length;
				//now get rid of any duplicates (tweens of arrays of objects could cause duplicates)
				while (--i > -1) {
					t = a[i];
					j = i;
					while (--j > -1) {
						if (t === a[j]) {
							a.splice(i, 1);
						}
					}
				}
			} else {
				a = _register(target).concat();
				i = a.length;
				while (--i > -1) {
					if (a[i]._gc || (onlyActive && !a[i].isActive())) {
						a.splice(i, 1);
					}
				}
			}
			return a;
		};

		TweenLite.killTweensOf = TweenLite.killDelayedCallsTo = function(target, onlyActive, vars) {
			if (typeof(onlyActive) === "object") {
				vars = onlyActive; //for backwards compatibility (before "onlyActive" parameter was inserted)
				onlyActive = false;
			}
			var a = TweenLite.getTweensOf(target, onlyActive),
				i = a.length;
			while (--i > -1) {
				a[i]._kill(vars, target);
			}
		};



/*
 * ----------------------------------------------------------------
 * TweenPlugin   (could easily be split out as a separate file/class, but included for ease of use (so that people don't need to include another script call before loading plugins which is easy to forget)
 * ----------------------------------------------------------------
 */
		var TweenPlugin = _class("plugins.TweenPlugin", function(props, priority) {
					this._overwriteProps = (props || "").split(",");
					this._propName = this._overwriteProps[0];
					this._priority = priority || 0;
					this._super = TweenPlugin.prototype;
				}, true);

		p = TweenPlugin.prototype;
		TweenPlugin.version = "1.18.0";
		TweenPlugin.API = 2;
		p._firstPT = null;
		p._addTween = _addPropTween;
		p.setRatio = _setRatio;

		p._kill = function(lookup) {
			var a = this._overwriteProps,
				pt = this._firstPT,
				i;
			if (lookup[this._propName] != null) {
				this._overwriteProps = [];
			} else {
				i = a.length;
				while (--i > -1) {
					if (lookup[a[i]] != null) {
						a.splice(i, 1);
					}
				}
			}
			while (pt) {
				if (lookup[pt.n] != null) {
					if (pt._next) {
						pt._next._prev = pt._prev;
					}
					if (pt._prev) {
						pt._prev._next = pt._next;
						pt._prev = null;
					} else if (this._firstPT === pt) {
						this._firstPT = pt._next;
					}
				}
				pt = pt._next;
			}
			return false;
		};

		p._roundProps = function(lookup, value) {
			var pt = this._firstPT;
			while (pt) {
				if (lookup[this._propName] || (pt.n != null && lookup[ pt.n.split(this._propName + "_").join("") ])) { //some properties that are very plugin-specific add a prefix named after the _propName plus an underscore, so we need to ignore that extra stuff here.
					pt.r = value;
				}
				pt = pt._next;
			}
		};

		TweenLite._onPluginEvent = function(type, tween) {
			var pt = tween._firstPT,
				changed, pt2, first, last, next;
			if (type === "_onInitAllProps") {
				//sorts the PropTween linked list in order of priority because some plugins need to render earlier/later than others, like MotionBlurPlugin applies its effects after all x/y/alpha tweens have rendered on each frame.
				while (pt) {
					next = pt._next;
					pt2 = first;
					while (pt2 && pt2.pr > pt.pr) {
						pt2 = pt2._next;
					}
					if ((pt._prev = pt2 ? pt2._prev : last)) {
						pt._prev._next = pt;
					} else {
						first = pt;
					}
					if ((pt._next = pt2)) {
						pt2._prev = pt;
					} else {
						last = pt;
					}
					pt = next;
				}
				pt = tween._firstPT = first;
			}
			while (pt) {
				if (pt.pg) if (typeof(pt.t[type]) === "function") if (pt.t[type]()) {
					changed = true;
				}
				pt = pt._next;
			}
			return changed;
		};

		TweenPlugin.activate = function(plugins) {
			var i = plugins.length;
			while (--i > -1) {
				if (plugins[i].API === TweenPlugin.API) {
					_plugins[(new plugins[i]())._propName] = plugins[i];
				}
			}
			return true;
		};

		//provides a more concise way to define plugins that have no dependencies besides TweenPlugin and TweenLite, wrapping common boilerplate stuff into one function (added in 1.9.0). You don't NEED to use this to define a plugin - the old way still works and can be useful in certain (rare) situations.
		_gsDefine.plugin = function(config) {
			if (!config || !config.propName || !config.init || !config.API) { throw "illegal plugin definition."; }
			var propName = config.propName,
				priority = config.priority || 0,
				overwriteProps = config.overwriteProps,
				map = {init:"_onInitTween", set:"setRatio", kill:"_kill", round:"_roundProps", initAll:"_onInitAllProps"},
				Plugin = _class("plugins." + propName.charAt(0).toUpperCase() + propName.substr(1) + "Plugin",
					function() {
						TweenPlugin.call(this, propName, priority);
						this._overwriteProps = overwriteProps || [];
					}, (config.global === true)),
				p = Plugin.prototype = new TweenPlugin(propName),
				prop;
			p.constructor = Plugin;
			Plugin.API = config.API;
			for (prop in map) {
				if (typeof(config[prop]) === "function") {
					p[map[prop]] = config[prop];
				}
			}
			Plugin.version = config.version;
			TweenPlugin.activate([Plugin]);
			return Plugin;
		};


		//now run through all the dependencies discovered and if any are missing, log that to the console as a warning. This is why it's best to have TweenLite load last - it can check all the dependencies for you.
		a = window._gsQueue;
		if (a) {
			for (i = 0; i < a.length; i++) {
				a[i]();
			}
			for (p in _defLookup) {
				if (!_defLookup[p].func) {
					window.console.log("GSAP encountered missing dependency: com.greensock." + p);
				}
			}
		}

		_tickerActive = false; //ensures that the first official animation forces a ticker.tick() to update the time when it is instantiated

})((typeof(module) !== "undefined" && module.exports && typeof(global) !== "undefined") ? global : this || window, "TweenLite");
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],5:[function(require,module,exports){
!function(){var n=function(t){return new n.fn.init(t)};n.each=function(n,t){for(var r=0;r<n.length;r++)t(r,n[r])},n.fn=n.prototype={init:function(n){var t=document.querySelectorAll(n)||[];return this.selector=t.length>1?t:t[0],this},css:function(n){var t={"background-image":"backgroundImage","background-position":"backgroundPosition"};for(var r in n)if(n.hasOwnProperty(r)){var e=n[r];t.hasOwnProperty(r)?this.selector.style[t[r]]=e:this.selector.style[r]=e}},on:function(n,t){return this.selector.addEventListener(n,t,!1),this}},n.fn.init.prototype=n.fn,window.gQuery=window.$=n}();

},{}],6:[function(require,module,exports){
//Main JS file
var gQuery = require('./libs/gquery/dist/gquery.min.js'),
    UTIL = require('./util.js'),
    TweenLite = require('./libs/TweenLite.js'),
    TimelineLite = require('./libs/TimelineLite.js'),
    CSSPlugin = require('./libs/CSSPlugin.js'),
    easePack = require('./libs/EasePack.js');
//You can use $('.class').selector or $('#id').selector for
//jQuery-like workflow. $.each(selector, callback), $.css({Object}),
//$.on(eventType, callback). Greensock TweenLite and TimelineLite
//are also included.
var Animations = (function () {
    'use strict';

    var timeline,			// Main Animation that hold the child animations
        variant,			// style... mpu / leaderboard etc
        elements = {}, 		// Home of all of the DOM Node Elements
        backgrounds = {};	// Just another handy container

    // Construct
    function Animations () {

    }

    // This creates all of our animation elements
    Animations.prototype.assign = function () {
        elements.ad     	= $('.ad').selector;
        elements.first 		= $('#element-1').selector;
        elements.second 	= $('#element-2').selector;
        elements.third 		= $('#element-3').selector;
        elements.fourth 	= $('#element-4').selector;
        elements.cta 		= $('#cta').selector;
        elements.logo 		= $('#logo').selector;

        this.construct();
    };

    // This creates all of our animation elements
    Animations.prototype.construct = function () {
        var durationZoomIn 		= 1,
            durationZoomOut 	= 1,
            durationFadeIn 		= 1,
            durationFadeOut 	= 1,
            pauseDuration 		= 2;

        // create a home for our animations
        // timeline = new TimelineLite( {onComplete:this.onFinish, onCompleteParams:["test1", "test2"], onCompleteScope:this } );
        timeline = new TimelineLite();

        var scene1 = new TimelineLite();
        // Frame # 1 -------------------------------------------------------------------------
        // Fade in
        scene1.fromTo(elements.first, durationFadeIn, {autoAlpha:0}, {autoAlpha:1});
        scene1.to(elements.first, durationFadeOut, {autoAlpha:0}, '+='+pauseDuration);

        scene1.fromTo(elements.second, durationFadeIn, {autoAlpha:0}, {autoAlpha:1});
        scene1.to(elements.second, durationFadeOut, {autoAlpha:0}, '+='+pauseDuration);

        var scene2 = new TimelineLite();
        // Frame # 2 -------------------------------------------------------------------------
        // Fade in
        scene2.fromTo(elements.third, durationFadeIn, {autoAlpha:0}, {autoAlpha:1});
        scene2.to(elements.third, durationFadeOut, {autoAlpha:0}, '+='+pauseDuration);

        scene2.fromTo(elements.fourth, durationFadeIn, {autoAlpha:0}, {autoAlpha:1});
        scene2.to(elements.fourth, durationFadeOut, {autoAlpha:0}, '+='+pauseDuration);

        var endframe = new TimelineLite();
        // Endframe -------------------------------------------------------------------------
        // Fade in
        endframe.fromTo(elements.logo, durationFadeIn, {autoAlpha:0}, {autoAlpha:1});

        endframe.fromTo(elements.cta, durationFadeIn, {autoAlpha:0}, {autoAlpha:1});

        // Create timeline
        timeline.add(scene1);
        timeline.add(scene2);
        timeline.add(endframe);

        // wait before starting the animation!
        timeline.pause();
    };

    // This Kicks off the animation on screen
    Animations.prototype.onFinish = function (scope) {

    };

    Animations.prototype.begin = function () {
        // hide loader!
        // remove loading class from #content
        UTIL.removeClass(elements.ad , 'loading');
        timeline.play();
    };

    return Animations;
})();

window.onload = function () {
    var anim = new Animations();

    anim.assign();
    anim.begin();
};

},{"./libs/CSSPlugin.js":1,"./libs/EasePack.js":2,"./libs/TimelineLite.js":3,"./libs/TweenLite.js":4,"./libs/gquery/dist/gquery.min.js":5,"./util.js":7}],7:[function(require,module,exports){
// Global Utilities for
var UTIL = UTIL || {};

// Polyfilling Class Management
UTIL.removeClass = function(element, className) {
    if (element.classList) element.classList.remove(className);
    else element.className = element.className.replace(new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
};

UTIL.addClass = function(element, className) {
    if (element.classList) element.classList.add(className);
    else element.className += ' ' + className;
};

module.exports = UTIL;

},{}]},{},[6])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvamF2YXNjcmlwdC9saWJzL0NTU1BsdWdpbi5qcyIsInNyYy9qYXZhc2NyaXB0L2xpYnMvRWFzZVBhY2suanMiLCJzcmMvamF2YXNjcmlwdC9saWJzL1RpbWVsaW5lTGl0ZS5qcyIsInNyYy9qYXZhc2NyaXB0L2xpYnMvVHdlZW5MaXRlLmpzIiwic3JjL2phdmFzY3JpcHQvbGlicy9ncXVlcnkvZGlzdC9ncXVlcnkubWluLmpzIiwic3JjL2phdmFzY3JpcHQvbWFpbi5qcyIsInNyYy9qYXZhc2NyaXB0L3V0aWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ25uRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ3hWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDM3dCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzUxREE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIVxuICogVkVSU0lPTjogMS4xOC4wXG4gKiBEQVRFOiAyMDE1LTA5LTA1XG4gKiBVUERBVEVTIEFORCBET0NTIEFUOiBodHRwOi8vZ3JlZW5zb2NrLmNvbVxuICpcbiAqIEBsaWNlbnNlIENvcHlyaWdodCAoYykgMjAwOC0yMDE1LCBHcmVlblNvY2suIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIHdvcmsgaXMgc3ViamVjdCB0byB0aGUgdGVybXMgYXQgaHR0cDovL2dyZWVuc29jay5jb20vc3RhbmRhcmQtbGljZW5zZSBvciBmb3JcbiAqIENsdWIgR3JlZW5Tb2NrIG1lbWJlcnMsIHRoZSBzb2Z0d2FyZSBhZ3JlZW1lbnQgdGhhdCB3YXMgaXNzdWVkIHdpdGggeW91ciBtZW1iZXJzaGlwLlxuICpcbiAqIEBhdXRob3I6IEphY2sgRG95bGUsIGphY2tAZ3JlZW5zb2NrLmNvbVxuICovXG52YXIgX2dzU2NvcGUgPSAodHlwZW9mKG1vZHVsZSkgIT09IFwidW5kZWZpbmVkXCIgJiYgbW9kdWxlLmV4cG9ydHMgJiYgdHlwZW9mKGdsb2JhbCkgIT09IFwidW5kZWZpbmVkXCIpID8gZ2xvYmFsIDogdGhpcyB8fCB3aW5kb3c7IC8vaGVscHMgZW5zdXJlIGNvbXBhdGliaWxpdHkgd2l0aCBBTUQvUmVxdWlyZUpTIGFuZCBDb21tb25KUy9Ob2RlXG4oX2dzU2NvcGUuX2dzUXVldWUgfHwgKF9nc1Njb3BlLl9nc1F1ZXVlID0gW10pKS5wdXNoKCBmdW5jdGlvbigpIHtcblxuXHRcInVzZSBzdHJpY3RcIjtcblxuXHRfZ3NTY29wZS5fZ3NEZWZpbmUoXCJwbHVnaW5zLkNTU1BsdWdpblwiLCBbXCJwbHVnaW5zLlR3ZWVuUGx1Z2luXCIsXCJUd2VlbkxpdGVcIl0sIGZ1bmN0aW9uKFR3ZWVuUGx1Z2luLCBUd2VlbkxpdGUpIHtcblxuXHRcdC8qKiBAY29uc3RydWN0b3IgKiovXG5cdFx0dmFyIENTU1BsdWdpbiA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRUd2VlblBsdWdpbi5jYWxsKHRoaXMsIFwiY3NzXCIpO1xuXHRcdFx0XHR0aGlzLl9vdmVyd3JpdGVQcm9wcy5sZW5ndGggPSAwO1xuXHRcdFx0XHR0aGlzLnNldFJhdGlvID0gQ1NTUGx1Z2luLnByb3RvdHlwZS5zZXRSYXRpbzsgLy9zcGVlZCBvcHRpbWl6YXRpb24gKGF2b2lkIHByb3RvdHlwZSBsb29rdXAgb24gdGhpcyBcImhvdFwiIG1ldGhvZClcblx0XHRcdH0sXG5cdFx0XHRfZ2xvYmFscyA9IF9nc1Njb3BlLl9nc0RlZmluZS5nbG9iYWxzLFxuXHRcdFx0X2hhc1ByaW9yaXR5LCAvL3R1cm5zIHRydWUgd2hlbmV2ZXIgYSBDU1NQcm9wVHdlZW4gaW5zdGFuY2UgaXMgY3JlYXRlZCB0aGF0IGhhcyBhIHByaW9yaXR5IG90aGVyIHRoYW4gMC4gVGhpcyBoZWxwcyB1cyBkaXNjZXJuIHdoZXRoZXIgb3Igbm90IHdlIHNob3VsZCBzcGVuZCB0aGUgdGltZSBvcmdhbml6aW5nIHRoZSBsaW5rZWQgbGlzdCBvciBub3QgYWZ0ZXIgYSBDU1NQbHVnaW4ncyBfb25Jbml0VHdlZW4oKSBtZXRob2QgaXMgY2FsbGVkLlxuXHRcdFx0X3N1ZmZpeE1hcCwgLy93ZSBzZXQgdGhpcyBpbiBfb25Jbml0VHdlZW4oKSBlYWNoIHRpbWUgYXMgYSB3YXkgdG8gaGF2ZSBhIHBlcnNpc3RlbnQgdmFyaWFibGUgd2UgY2FuIHVzZSBpbiBvdGhlciBtZXRob2RzIGxpa2UgX3BhcnNlKCkgd2l0aG91dCBoYXZpbmcgdG8gcGFzcyBpdCBhcm91bmQgYXMgYSBwYXJhbWV0ZXIgYW5kIHdlIGtlZXAgX3BhcnNlKCkgZGVjb3VwbGVkIGZyb20gYSBwYXJ0aWN1bGFyIENTU1BsdWdpbiBpbnN0YW5jZVxuXHRcdFx0X2NzLCAvL2NvbXB1dGVkIHN0eWxlICh3ZSBzdG9yZSB0aGlzIGluIGEgc2hhcmVkIHZhcmlhYmxlIHRvIGNvbnNlcnZlIG1lbW9yeSBhbmQgbWFrZSBtaW5pZmljYXRpb24gdGlnaHRlclxuXHRcdFx0X292ZXJ3cml0ZVByb3BzLCAvL2FsaWFzIHRvIHRoZSBjdXJyZW50bHkgaW5zdGFudGlhdGluZyBDU1NQbHVnaW4ncyBfb3ZlcndyaXRlUHJvcHMgYXJyYXkuIFdlIHVzZSB0aGlzIGNsb3N1cmUgaW4gb3JkZXIgdG8gYXZvaWQgaGF2aW5nIHRvIHBhc3MgYSByZWZlcmVuY2UgYXJvdW5kIGZyb20gbWV0aG9kIHRvIG1ldGhvZCBhbmQgYWlkIGluIG1pbmlmaWNhdGlvbi5cblx0XHRcdF9zcGVjaWFsUHJvcHMgPSB7fSxcblx0XHRcdHAgPSBDU1NQbHVnaW4ucHJvdG90eXBlID0gbmV3IFR3ZWVuUGx1Z2luKFwiY3NzXCIpO1xuXG5cdFx0cC5jb25zdHJ1Y3RvciA9IENTU1BsdWdpbjtcblx0XHRDU1NQbHVnaW4udmVyc2lvbiA9IFwiMS4xOC4wXCI7XG5cdFx0Q1NTUGx1Z2luLkFQSSA9IDI7XG5cdFx0Q1NTUGx1Z2luLmRlZmF1bHRUcmFuc2Zvcm1QZXJzcGVjdGl2ZSA9IDA7XG5cdFx0Q1NTUGx1Z2luLmRlZmF1bHRTa2V3VHlwZSA9IFwiY29tcGVuc2F0ZWRcIjtcblx0XHRDU1NQbHVnaW4uZGVmYXVsdFNtb290aE9yaWdpbiA9IHRydWU7XG5cdFx0cCA9IFwicHhcIjsgLy93ZSdsbCByZXVzZSB0aGUgXCJwXCIgdmFyaWFibGUgdG8ga2VlcCBmaWxlIHNpemUgZG93blxuXHRcdENTU1BsdWdpbi5zdWZmaXhNYXAgPSB7dG9wOnAsIHJpZ2h0OnAsIGJvdHRvbTpwLCBsZWZ0OnAsIHdpZHRoOnAsIGhlaWdodDpwLCBmb250U2l6ZTpwLCBwYWRkaW5nOnAsIG1hcmdpbjpwLCBwZXJzcGVjdGl2ZTpwLCBsaW5lSGVpZ2h0OlwiXCJ9O1xuXG5cblx0XHR2YXIgX251bUV4cCA9IC8oPzpcXGR8XFwtXFxkfFxcLlxcZHxcXC1cXC5cXGQpKy9nLFxuXHRcdFx0X3JlbE51bUV4cCA9IC8oPzpcXGR8XFwtXFxkfFxcLlxcZHxcXC1cXC5cXGR8XFwrPVxcZHxcXC09XFxkfFxcKz0uXFxkfFxcLT1cXC5cXGQpKy9nLFxuXHRcdFx0X3ZhbHVlc0V4cCA9IC8oPzpcXCs9fFxcLT18XFwtfFxcYilbXFxkXFwtXFwuXStbYS16QS1aMC05XSooPzolfFxcYikvZ2ksIC8vZmluZHMgYWxsIHRoZSB2YWx1ZXMgdGhhdCBiZWdpbiB3aXRoIG51bWJlcnMgb3IgKz0gb3IgLT0gYW5kIHRoZW4gYSBudW1iZXIuIEluY2x1ZGVzIHN1ZmZpeGVzLiBXZSB1c2UgdGhpcyB0byBzcGxpdCBjb21wbGV4IHZhbHVlcyBhcGFydCBsaWtlIFwiMXB4IDVweCAyMHB4IHJnYigyNTUsMTAyLDUxKVwiXG5cdFx0XHRfTmFORXhwID0gLyg/IVsrLV0/XFxkKlxcLj9cXGQrfFsrLV18ZVsrLV1cXGQrKVteMC05XS9nLCAvL2Fsc28gYWxsb3dzIHNjaWVudGlmaWMgbm90YXRpb24gYW5kIGRvZXNuJ3Qga2lsbCB0aGUgbGVhZGluZyAtLysgaW4gLT0gYW5kICs9XG5cdFx0XHRfc3VmZml4RXhwID0gLyg/OlxcZHxcXC18XFwrfD18I3xcXC4pKi9nLFxuXHRcdFx0X29wYWNpdHlFeHAgPSAvb3BhY2l0eSAqPSAqKFteKV0qKS9pLFxuXHRcdFx0X29wYWNpdHlWYWxFeHAgPSAvb3BhY2l0eTooW147XSopL2ksXG5cdFx0XHRfYWxwaGFGaWx0ZXJFeHAgPSAvYWxwaGFcXChvcGFjaXR5ICo9Lis/XFwpL2ksXG5cdFx0XHRfcmdiaHNsRXhwID0gL14ocmdifGhzbCkvLFxuXHRcdFx0X2NhcHNFeHAgPSAvKFtBLVpdKS9nLFxuXHRcdFx0X2NhbWVsRXhwID0gLy0oW2Etel0pL2dpLFxuXHRcdFx0X3VybEV4cCA9IC8oXig/OnVybFxcKFxcXCJ8dXJsXFwoKSl8KD86KFxcXCJcXCkpJHxcXCkkKS9naSwgLy9mb3IgcHVsbGluZyBvdXQgdXJscyBmcm9tIHVybCguLi4pIG9yIHVybChcIi4uLlwiKSBzdHJpbmdzIChzb21lIGJyb3dzZXJzIHdyYXAgdXJscyBpbiBxdW90ZXMsIHNvbWUgZG9uJ3Qgd2hlbiByZXBvcnRpbmcgdGhpbmdzIGxpa2UgYmFja2dyb3VuZEltYWdlKVxuXHRcdFx0X2NhbWVsRnVuYyA9IGZ1bmN0aW9uKHMsIGcpIHsgcmV0dXJuIGcudG9VcHBlckNhc2UoKTsgfSxcblx0XHRcdF9ob3JpekV4cCA9IC8oPzpMZWZ0fFJpZ2h0fFdpZHRoKS9pLFxuXHRcdFx0X2llR2V0TWF0cml4RXhwID0gLyhNMTF8TTEyfE0yMXxNMjIpPVtcXGRcXC1cXC5lXSsvZ2ksXG5cdFx0XHRfaWVTZXRNYXRyaXhFeHAgPSAvcHJvZ2lkXFw6RFhJbWFnZVRyYW5zZm9ybVxcLk1pY3Jvc29mdFxcLk1hdHJpeFxcKC4rP1xcKS9pLFxuXHRcdFx0X2NvbW1hc091dHNpZGVQYXJlbkV4cCA9IC8sKD89W15cXCldKig/OlxcKHwkKSkvZ2ksIC8vZmluZHMgYW55IGNvbW1hcyB0aGF0IGFyZSBub3Qgd2l0aGluIHBhcmVudGhlc2lzXG5cdFx0XHRfREVHMlJBRCA9IE1hdGguUEkgLyAxODAsXG5cdFx0XHRfUkFEMkRFRyA9IDE4MCAvIE1hdGguUEksXG5cdFx0XHRfZm9yY2VQVCA9IHt9LFxuXHRcdFx0X2RvYyA9IGRvY3VtZW50LFxuXHRcdFx0X2NyZWF0ZUVsZW1lbnQgPSBmdW5jdGlvbih0eXBlKSB7XG5cdFx0XHRcdHJldHVybiBfZG9jLmNyZWF0ZUVsZW1lbnROUyA/IF9kb2MuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCB0eXBlKSA6IF9kb2MuY3JlYXRlRWxlbWVudCh0eXBlKTtcblx0XHRcdH0sXG5cdFx0XHRfdGVtcERpdiA9IF9jcmVhdGVFbGVtZW50KFwiZGl2XCIpLFxuXHRcdFx0X3RlbXBJbWcgPSBfY3JlYXRlRWxlbWVudChcImltZ1wiKSxcblx0XHRcdF9pbnRlcm5hbHMgPSBDU1NQbHVnaW4uX2ludGVybmFscyA9IHtfc3BlY2lhbFByb3BzOl9zcGVjaWFsUHJvcHN9LCAvL3Byb3ZpZGVzIGEgaG9vayB0byBhIGZldyBpbnRlcm5hbCBtZXRob2RzIHRoYXQgd2UgbmVlZCB0byBhY2Nlc3MgZnJvbSBpbnNpZGUgb3RoZXIgcGx1Z2luc1xuXHRcdFx0X2FnZW50ID0gbmF2aWdhdG9yLnVzZXJBZ2VudCxcblx0XHRcdF9hdXRvUm91bmQsXG5cdFx0XHRfcmVxU2FmYXJpRml4LCAvL3dlIHdvbid0IGFwcGx5IHRoZSBTYWZhcmkgdHJhbnNmb3JtIGZpeCB1bnRpbCB3ZSBhY3R1YWxseSBjb21lIGFjcm9zcyBhIHR3ZWVuIHRoYXQgYWZmZWN0cyBhIHRyYW5zZm9ybSBwcm9wZXJ0eSAodG8gbWFpbnRhaW4gYmVzdCBwZXJmb3JtYW5jZSkuXG5cblx0XHRcdF9pc1NhZmFyaSxcblx0XHRcdF9pc0ZpcmVmb3gsIC8vRmlyZWZveCBoYXMgYSBidWcgdGhhdCBjYXVzZXMgM0QgdHJhbnNmb3JtZWQgZWxlbWVudHMgdG8gcmFuZG9tbHkgZGlzYXBwZWFyIHVubGVzcyBhIHJlcGFpbnQgaXMgZm9yY2VkIGFmdGVyIGVhY2ggdXBkYXRlIG9uIGVhY2ggZWxlbWVudC5cblx0XHRcdF9pc1NhZmFyaUxUNiwgLy9TYWZhcmkgKGFuZCBBbmRyb2lkIDQgd2hpY2ggdXNlcyBhIGZsYXZvciBvZiBTYWZhcmkpIGhhcyBhIGJ1ZyB0aGF0IHByZXZlbnRzIGNoYW5nZXMgdG8gXCJ0b3BcIiBhbmQgXCJsZWZ0XCIgcHJvcGVydGllcyBmcm9tIHJlbmRlcmluZyBwcm9wZXJseSBpZiBjaGFuZ2VkIG9uIHRoZSBzYW1lIGZyYW1lIGFzIGEgdHJhbnNmb3JtIFVOTEVTUyB3ZSBzZXQgdGhlIGVsZW1lbnQncyBXZWJraXRCYWNrZmFjZVZpc2liaWxpdHkgdG8gaGlkZGVuICh3ZWlyZCwgSSBrbm93KS4gRG9pbmcgdGhpcyBmb3IgQW5kcm9pZCAzIGFuZCBlYXJsaWVyIHNlZW1zIHRvIGFjdHVhbGx5IGNhdXNlIG90aGVyIHByb2JsZW1zLCB0aG91Z2ggKGZ1biEpXG5cdFx0XHRfaWVWZXJzLFxuXHRcdFx0X3N1cHBvcnRzT3BhY2l0eSA9IChmdW5jdGlvbigpIHsgLy93ZSBzZXQgX2lzU2FmYXJpLCBfaWVWZXJzLCBfaXNGaXJlZm94LCBhbmQgX3N1cHBvcnRzT3BhY2l0eSBhbGwgaW4gb25lIGZ1bmN0aW9uIGhlcmUgdG8gcmVkdWNlIGZpbGUgc2l6ZSBzbGlnaHRseSwgZXNwZWNpYWxseSBpbiB0aGUgbWluaWZpZWQgdmVyc2lvbi5cblx0XHRcdFx0dmFyIGkgPSBfYWdlbnQuaW5kZXhPZihcIkFuZHJvaWRcIiksXG5cdFx0XHRcdFx0YSA9IF9jcmVhdGVFbGVtZW50KFwiYVwiKTtcblx0XHRcdFx0X2lzU2FmYXJpID0gKF9hZ2VudC5pbmRleE9mKFwiU2FmYXJpXCIpICE9PSAtMSAmJiBfYWdlbnQuaW5kZXhPZihcIkNocm9tZVwiKSA9PT0gLTEgJiYgKGkgPT09IC0xIHx8IE51bWJlcihfYWdlbnQuc3Vic3RyKGkrOCwgMSkpID4gMykpO1xuXHRcdFx0XHRfaXNTYWZhcmlMVDYgPSAoX2lzU2FmYXJpICYmIChOdW1iZXIoX2FnZW50LnN1YnN0cihfYWdlbnQuaW5kZXhPZihcIlZlcnNpb24vXCIpKzgsIDEpKSA8IDYpKTtcblx0XHRcdFx0X2lzRmlyZWZveCA9IChfYWdlbnQuaW5kZXhPZihcIkZpcmVmb3hcIikgIT09IC0xKTtcblx0XHRcdFx0aWYgKCgvTVNJRSAoWzAtOV17MSx9W1xcLjAtOV17MCx9KS8pLmV4ZWMoX2FnZW50KSB8fCAoL1RyaWRlbnRcXC8uKnJ2OihbMC05XXsxLH1bXFwuMC05XXswLH0pLykuZXhlYyhfYWdlbnQpKSB7XG5cdFx0XHRcdFx0X2llVmVycyA9IHBhcnNlRmxvYXQoIFJlZ0V4cC4kMSApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghYSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhLnN0eWxlLmNzc1RleHQgPSBcInRvcDoxcHg7b3BhY2l0eTouNTU7XCI7XG5cdFx0XHRcdHJldHVybiAvXjAuNTUvLnRlc3QoYS5zdHlsZS5vcGFjaXR5KTtcblx0XHRcdH0oKSksXG5cdFx0XHRfZ2V0SUVPcGFjaXR5ID0gZnVuY3Rpb24odikge1xuXHRcdFx0XHRyZXR1cm4gKF9vcGFjaXR5RXhwLnRlc3QoICgodHlwZW9mKHYpID09PSBcInN0cmluZ1wiKSA/IHYgOiAodi5jdXJyZW50U3R5bGUgPyB2LmN1cnJlbnRTdHlsZS5maWx0ZXIgOiB2LnN0eWxlLmZpbHRlcikgfHwgXCJcIikgKSA/ICggcGFyc2VGbG9hdCggUmVnRXhwLiQxICkgLyAxMDAgKSA6IDEpO1xuXHRcdFx0fSxcblx0XHRcdF9sb2cgPSBmdW5jdGlvbihzKSB7Ly9mb3IgbG9nZ2luZyBtZXNzYWdlcywgYnV0IGluIGEgd2F5IHRoYXQgd29uJ3QgdGhyb3cgZXJyb3JzIGluIG9sZCB2ZXJzaW9ucyBvZiBJRS5cblx0XHRcdFx0aWYgKHdpbmRvdy5jb25zb2xlKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2cocyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdF9wcmVmaXhDU1MgPSBcIlwiLCAvL3RoZSBub24tY2FtZWxDYXNlIHZlbmRvciBwcmVmaXggbGlrZSBcIi1vLVwiLCBcIi1tb3otXCIsIFwiLW1zLVwiLCBvciBcIi13ZWJraXQtXCJcblx0XHRcdF9wcmVmaXggPSBcIlwiLCAvL2NhbWVsQ2FzZSB2ZW5kb3IgcHJlZml4IGxpa2UgXCJPXCIsIFwibXNcIiwgXCJXZWJraXRcIiwgb3IgXCJNb3pcIi5cblxuXHRcdFx0Ly8gQHByaXZhdGUgZmVlZCBpbiBhIGNhbWVsQ2FzZSBwcm9wZXJ0eSBuYW1lIGxpa2UgXCJ0cmFuc2Zvcm1cIiBhbmQgaXQgd2lsbCBjaGVjayB0byBzZWUgaWYgaXQgaXMgdmFsaWQgYXMtaXMgb3IgaWYgaXQgbmVlZHMgYSB2ZW5kb3IgcHJlZml4LiBJdCByZXR1cm5zIHRoZSBjb3JyZWN0ZWQgY2FtZWxDYXNlIHByb3BlcnR5IG5hbWUgKGkuZS4gXCJXZWJraXRUcmFuc2Zvcm1cIiBvciBcIk1velRyYW5zZm9ybVwiIG9yIFwidHJhbnNmb3JtXCIgb3IgbnVsbCBpZiBubyBzdWNoIHByb3BlcnR5IGlzIGZvdW5kLCBsaWtlIGlmIHRoZSBicm93c2VyIGlzIElFOCBvciBiZWZvcmUsIFwidHJhbnNmb3JtXCIgd29uJ3QgYmUgZm91bmQgYXQgYWxsKVxuXHRcdFx0X2NoZWNrUHJvcFByZWZpeCA9IGZ1bmN0aW9uKHAsIGUpIHtcblx0XHRcdFx0ZSA9IGUgfHwgX3RlbXBEaXY7XG5cdFx0XHRcdHZhciBzID0gZS5zdHlsZSxcblx0XHRcdFx0XHRhLCBpO1xuXHRcdFx0XHRpZiAoc1twXSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cCA9IHAuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBwLnN1YnN0cigxKTtcblx0XHRcdFx0YSA9IFtcIk9cIixcIk1velwiLFwibXNcIixcIk1zXCIsXCJXZWJraXRcIl07XG5cdFx0XHRcdGkgPSA1O1xuXHRcdFx0XHR3aGlsZSAoLS1pID4gLTEgJiYgc1thW2ldK3BdID09PSB1bmRlZmluZWQpIHsgfVxuXHRcdFx0XHRpZiAoaSA+PSAwKSB7XG5cdFx0XHRcdFx0X3ByZWZpeCA9IChpID09PSAzKSA/IFwibXNcIiA6IGFbaV07XG5cdFx0XHRcdFx0X3ByZWZpeENTUyA9IFwiLVwiICsgX3ByZWZpeC50b0xvd2VyQ2FzZSgpICsgXCItXCI7XG5cdFx0XHRcdFx0cmV0dXJuIF9wcmVmaXggKyBwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fSxcblxuXHRcdFx0X2dldENvbXB1dGVkU3R5bGUgPSBfZG9jLmRlZmF1bHRWaWV3ID8gX2RvYy5kZWZhdWx0Vmlldy5nZXRDb21wdXRlZFN0eWxlIDogZnVuY3Rpb24oKSB7fSxcblxuXHRcdFx0LyoqXG5cdFx0XHQgKiBAcHJpdmF0ZSBSZXR1cm5zIHRoZSBjc3Mgc3R5bGUgZm9yIGEgcGFydGljdWxhciBwcm9wZXJ0eSBvZiBhbiBlbGVtZW50LiBGb3IgZXhhbXBsZSwgdG8gZ2V0IHdoYXRldmVyIHRoZSBjdXJyZW50IFwibGVmdFwiIGNzcyB2YWx1ZSBmb3IgYW4gZWxlbWVudCB3aXRoIGFuIElEIG9mIFwibXlFbGVtZW50XCIsIHlvdSBjb3VsZCBkbzpcblx0XHRcdCAqIHZhciBjdXJyZW50TGVmdCA9IENTU1BsdWdpbi5nZXRTdHlsZSggZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJteUVsZW1lbnRcIiksIFwibGVmdFwiKTtcblx0XHRcdCAqXG5cdFx0XHQgKiBAcGFyYW0geyFPYmplY3R9IHQgVGFyZ2V0IGVsZW1lbnQgd2hvc2Ugc3R5bGUgcHJvcGVydHkgeW91IHdhbnQgdG8gcXVlcnlcblx0XHRcdCAqIEBwYXJhbSB7IXN0cmluZ30gcCBQcm9wZXJ0eSBuYW1lIChsaWtlIFwibGVmdFwiIG9yIFwidG9wXCIgb3IgXCJtYXJnaW5Ub3BcIiwgZXRjLilcblx0XHRcdCAqIEBwYXJhbSB7T2JqZWN0PX0gY3MgQ29tcHV0ZWQgc3R5bGUgb2JqZWN0LiBUaGlzIGp1c3QgcHJvdmlkZXMgYSB3YXkgdG8gc3BlZWQgcHJvY2Vzc2luZyBpZiB5b3UncmUgZ29pbmcgdG8gZ2V0IHNldmVyYWwgcHJvcGVydGllcyBvbiB0aGUgc2FtZSBlbGVtZW50IGluIHF1aWNrIHN1Y2Nlc3Npb24gLSB5b3UgY2FuIHJldXNlIHRoZSByZXN1bHQgb2YgdGhlIGdldENvbXB1dGVkU3R5bGUoKSBjYWxsLlxuXHRcdFx0ICogQHBhcmFtIHtib29sZWFuPX0gY2FsYyBJZiB0cnVlLCB0aGUgdmFsdWUgd2lsbCBub3QgYmUgcmVhZCBkaXJlY3RseSBmcm9tIHRoZSBlbGVtZW50J3MgXCJzdHlsZVwiIHByb3BlcnR5IChpZiBpdCBleGlzdHMgdGhlcmUpLCBidXQgaW5zdGVhZCB0aGUgZ2V0Q29tcHV0ZWRTdHlsZSgpIHJlc3VsdCB3aWxsIGJlIHVzZWQuIFRoaXMgY2FuIGJlIHVzZWZ1bCB3aGVuIHlvdSB3YW50IHRvIGVuc3VyZSB0aGF0IHRoZSBicm93c2VyIGl0c2VsZiBpcyBpbnRlcnByZXRpbmcgdGhlIHZhbHVlLlxuXHRcdFx0ICogQHBhcmFtIHtzdHJpbmc9fSBkZmx0IERlZmF1bHQgdmFsdWUgdGhhdCBzaG91bGQgYmUgcmV0dXJuZWQgaW4gdGhlIHBsYWNlIG9mIG51bGwsIFwibm9uZVwiLCBcImF1dG9cIiBvciBcImF1dG8gYXV0b1wiLlxuXHRcdFx0ICogQHJldHVybiB7P3N0cmluZ30gVGhlIGN1cnJlbnQgcHJvcGVydHkgdmFsdWVcblx0XHRcdCAqL1xuXHRcdFx0X2dldFN0eWxlID0gQ1NTUGx1Z2luLmdldFN0eWxlID0gZnVuY3Rpb24odCwgcCwgY3MsIGNhbGMsIGRmbHQpIHtcblx0XHRcdFx0dmFyIHJ2O1xuXHRcdFx0XHRpZiAoIV9zdXBwb3J0c09wYWNpdHkpIGlmIChwID09PSBcIm9wYWNpdHlcIikgeyAvL3NldmVyYWwgdmVyc2lvbnMgb2YgSUUgZG9uJ3QgdXNlIHRoZSBzdGFuZGFyZCBcIm9wYWNpdHlcIiBwcm9wZXJ0eSAtIHRoZXkgdXNlIHRoaW5ncyBsaWtlIGZpbHRlcjphbHBoYShvcGFjaXR5PTUwKSwgc28gd2UgcGFyc2UgdGhhdCBoZXJlLlxuXHRcdFx0XHRcdHJldHVybiBfZ2V0SUVPcGFjaXR5KHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghY2FsYyAmJiB0LnN0eWxlW3BdKSB7XG5cdFx0XHRcdFx0cnYgPSB0LnN0eWxlW3BdO1xuXHRcdFx0XHR9IGVsc2UgaWYgKChjcyA9IGNzIHx8IF9nZXRDb21wdXRlZFN0eWxlKHQpKSkge1xuXHRcdFx0XHRcdHJ2ID0gY3NbcF0gfHwgY3MuZ2V0UHJvcGVydHlWYWx1ZShwKSB8fCBjcy5nZXRQcm9wZXJ0eVZhbHVlKHAucmVwbGFjZShfY2Fwc0V4cCwgXCItJDFcIikudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodC5jdXJyZW50U3R5bGUpIHtcblx0XHRcdFx0XHRydiA9IHQuY3VycmVudFN0eWxlW3BdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAoZGZsdCAhPSBudWxsICYmICghcnYgfHwgcnYgPT09IFwibm9uZVwiIHx8IHJ2ID09PSBcImF1dG9cIiB8fCBydiA9PT0gXCJhdXRvIGF1dG9cIikpID8gZGZsdCA6IHJ2O1xuXHRcdFx0fSxcblxuXHRcdFx0LyoqXG5cdFx0XHQgKiBAcHJpdmF0ZSBQYXNzIHRoZSB0YXJnZXQgZWxlbWVudCwgdGhlIHByb3BlcnR5IG5hbWUsIHRoZSBudW1lcmljIHZhbHVlLCBhbmQgdGhlIHN1ZmZpeCAobGlrZSBcIiVcIiwgXCJlbVwiLCBcInB4XCIsIGV0Yy4pIGFuZCBpdCB3aWxsIHNwaXQgYmFjayB0aGUgZXF1aXZhbGVudCBwaXhlbCBudW1iZXIuXG5cdFx0XHQgKiBAcGFyYW0geyFPYmplY3R9IHQgVGFyZ2V0IGVsZW1lbnRcblx0XHRcdCAqIEBwYXJhbSB7IXN0cmluZ30gcCBQcm9wZXJ0eSBuYW1lIChsaWtlIFwibGVmdFwiLCBcInRvcFwiLCBcIm1hcmdpbkxlZnRcIiwgZXRjLilcblx0XHRcdCAqIEBwYXJhbSB7IW51bWJlcn0gdiBWYWx1ZVxuXHRcdFx0ICogQHBhcmFtIHtzdHJpbmc9fSBzZnggU3VmZml4IChsaWtlIFwicHhcIiBvciBcIiVcIiBvciBcImVtXCIpXG5cdFx0XHQgKiBAcGFyYW0ge2Jvb2xlYW49fSByZWN1cnNlIElmIHRydWUsIHRoZSBjYWxsIGlzIGEgcmVjdXJzaXZlIG9uZS4gSW4gc29tZSBicm93c2VycyAobGlrZSBJRTcvOCksIG9jY2FzaW9uYWxseSB0aGUgdmFsdWUgaXNuJ3QgYWNjdXJhdGVseSByZXBvcnRlZCBpbml0aWFsbHksIGJ1dCBpZiB3ZSBydW4gdGhlIGZ1bmN0aW9uIGFnYWluIGl0IHdpbGwgdGFrZSBlZmZlY3QuXG5cdFx0XHQgKiBAcmV0dXJuIHtudW1iZXJ9IHZhbHVlIGluIHBpeGVsc1xuXHRcdFx0ICovXG5cdFx0XHRfY29udmVydFRvUGl4ZWxzID0gX2ludGVybmFscy5jb252ZXJ0VG9QaXhlbHMgPSBmdW5jdGlvbih0LCBwLCB2LCBzZngsIHJlY3Vyc2UpIHtcblx0XHRcdFx0aWYgKHNmeCA9PT0gXCJweFwiIHx8ICFzZngpIHsgcmV0dXJuIHY7IH1cblx0XHRcdFx0aWYgKHNmeCA9PT0gXCJhdXRvXCIgfHwgIXYpIHsgcmV0dXJuIDA7IH1cblx0XHRcdFx0dmFyIGhvcml6ID0gX2hvcml6RXhwLnRlc3QocCksXG5cdFx0XHRcdFx0bm9kZSA9IHQsXG5cdFx0XHRcdFx0c3R5bGUgPSBfdGVtcERpdi5zdHlsZSxcblx0XHRcdFx0XHRuZWcgPSAodiA8IDApLFxuXHRcdFx0XHRcdHBpeCwgY2FjaGUsIHRpbWU7XG5cdFx0XHRcdGlmIChuZWcpIHtcblx0XHRcdFx0XHR2ID0gLXY7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNmeCA9PT0gXCIlXCIgJiYgcC5pbmRleE9mKFwiYm9yZGVyXCIpICE9PSAtMSkge1xuXHRcdFx0XHRcdHBpeCA9ICh2IC8gMTAwKSAqIChob3JpeiA/IHQuY2xpZW50V2lkdGggOiB0LmNsaWVudEhlaWdodCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3R5bGUuY3NzVGV4dCA9IFwiYm9yZGVyOjAgc29saWQgcmVkO3Bvc2l0aW9uOlwiICsgX2dldFN0eWxlKHQsIFwicG9zaXRpb25cIikgKyBcIjtsaW5lLWhlaWdodDowO1wiO1xuXHRcdFx0XHRcdGlmIChzZnggPT09IFwiJVwiIHx8ICFub2RlLmFwcGVuZENoaWxkIHx8IHNmeC5jaGFyQXQoMCkgPT09IFwidlwiIHx8IHNmeCA9PT0gXCJyZW1cIikge1xuXHRcdFx0XHRcdFx0bm9kZSA9IHQucGFyZW50Tm9kZSB8fCBfZG9jLmJvZHk7XG5cdFx0XHRcdFx0XHRjYWNoZSA9IG5vZGUuX2dzQ2FjaGU7XG5cdFx0XHRcdFx0XHR0aW1lID0gVHdlZW5MaXRlLnRpY2tlci5mcmFtZTtcblx0XHRcdFx0XHRcdGlmIChjYWNoZSAmJiBob3JpeiAmJiBjYWNoZS50aW1lID09PSB0aW1lKSB7IC8vcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uOiB3ZSByZWNvcmQgdGhlIHdpZHRoIG9mIGVsZW1lbnRzIGFsb25nIHdpdGggdGhlIHRpY2tlciBmcmFtZSBzbyB0aGF0IHdlIGNhbiBxdWlja2x5IGdldCBpdCBhZ2FpbiBvbiB0aGUgc2FtZSB0aWNrIChzZWVtcyByZWxhdGl2ZWx5IHNhZmUgdG8gYXNzdW1lIGl0IHdvdWxkbid0IGNoYW5nZSBvbiB0aGUgc2FtZSB0aWNrKVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY2FjaGUud2lkdGggKiB2IC8gMTAwO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c3R5bGVbKGhvcml6ID8gXCJ3aWR0aFwiIDogXCJoZWlnaHRcIildID0gdiArIHNmeDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c3R5bGVbKGhvcml6ID8gXCJib3JkZXJMZWZ0V2lkdGhcIiA6IFwiYm9yZGVyVG9wV2lkdGhcIildID0gdiArIHNmeDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bm9kZS5hcHBlbmRDaGlsZChfdGVtcERpdik7XG5cdFx0XHRcdFx0cGl4ID0gcGFyc2VGbG9hdChfdGVtcERpdlsoaG9yaXogPyBcIm9mZnNldFdpZHRoXCIgOiBcIm9mZnNldEhlaWdodFwiKV0pO1xuXHRcdFx0XHRcdG5vZGUucmVtb3ZlQ2hpbGQoX3RlbXBEaXYpO1xuXHRcdFx0XHRcdGlmIChob3JpeiAmJiBzZnggPT09IFwiJVwiICYmIENTU1BsdWdpbi5jYWNoZVdpZHRocyAhPT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdGNhY2hlID0gbm9kZS5fZ3NDYWNoZSA9IG5vZGUuX2dzQ2FjaGUgfHwge307XG5cdFx0XHRcdFx0XHRjYWNoZS50aW1lID0gdGltZTtcblx0XHRcdFx0XHRcdGNhY2hlLndpZHRoID0gcGl4IC8gdiAqIDEwMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBpeCA9PT0gMCAmJiAhcmVjdXJzZSkge1xuXHRcdFx0XHRcdFx0cGl4ID0gX2NvbnZlcnRUb1BpeGVscyh0LCBwLCB2LCBzZngsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbmVnID8gLXBpeCA6IHBpeDtcblx0XHRcdH0sXG5cdFx0XHRfY2FsY3VsYXRlT2Zmc2V0ID0gX2ludGVybmFscy5jYWxjdWxhdGVPZmZzZXQgPSBmdW5jdGlvbih0LCBwLCBjcykgeyAvL2ZvciBmaWd1cmluZyBvdXQgXCJ0b3BcIiBvciBcImxlZnRcIiBpbiBweCB3aGVuIGl0J3MgXCJhdXRvXCIuIFdlIG5lZWQgdG8gZmFjdG9yIGluIG1hcmdpbiB3aXRoIHRoZSBvZmZzZXRMZWZ0L29mZnNldFRvcFxuXHRcdFx0XHRpZiAoX2dldFN0eWxlKHQsIFwicG9zaXRpb25cIiwgY3MpICE9PSBcImFic29sdXRlXCIpIHsgcmV0dXJuIDA7IH1cblx0XHRcdFx0dmFyIGRpbSA9ICgocCA9PT0gXCJsZWZ0XCIpID8gXCJMZWZ0XCIgOiBcIlRvcFwiKSxcblx0XHRcdFx0XHR2ID0gX2dldFN0eWxlKHQsIFwibWFyZ2luXCIgKyBkaW0sIGNzKTtcblx0XHRcdFx0cmV0dXJuIHRbXCJvZmZzZXRcIiArIGRpbV0gLSAoX2NvbnZlcnRUb1BpeGVscyh0LCBwLCBwYXJzZUZsb2F0KHYpLCB2LnJlcGxhY2UoX3N1ZmZpeEV4cCwgXCJcIikpIHx8IDApO1xuXHRcdFx0fSxcblxuXHRcdFx0Ly8gQHByaXZhdGUgcmV0dXJucyBhdCBvYmplY3QgY29udGFpbmluZyBBTEwgb2YgdGhlIHN0eWxlIHByb3BlcnRpZXMgaW4gY2FtZWxDYXNlIGFuZCB0aGVpciBhc3NvY2lhdGVkIHZhbHVlcy5cblx0XHRcdF9nZXRBbGxTdHlsZXMgPSBmdW5jdGlvbih0LCBjcykge1xuXHRcdFx0XHR2YXIgcyA9IHt9LFxuXHRcdFx0XHRcdGksIHRyLCBwO1xuXHRcdFx0XHRpZiAoKGNzID0gY3MgfHwgX2dldENvbXB1dGVkU3R5bGUodCwgbnVsbCkpKSB7XG5cdFx0XHRcdFx0aWYgKChpID0gY3MubGVuZ3RoKSkge1xuXHRcdFx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0XHRcdHAgPSBjc1tpXTtcblx0XHRcdFx0XHRcdFx0aWYgKHAuaW5kZXhPZihcIi10cmFuc2Zvcm1cIikgPT09IC0xIHx8IF90cmFuc2Zvcm1Qcm9wQ1NTID09PSBwKSB7IC8vU29tZSB3ZWJraXQgYnJvd3NlcnMgZHVwbGljYXRlIHRyYW5zZm9ybSB2YWx1ZXMsIG9uZSBub24tcHJlZml4ZWQgYW5kIG9uZSBwcmVmaXhlZCAoXCJ0cmFuc2Zvcm1cIiBhbmQgXCJXZWJraXRUcmFuc2Zvcm1cIiksIHNvIHdlIG11c3Qgd2VlZCBvdXQgdGhlIGV4dHJhIG9uZSBoZXJlLlxuXHRcdFx0XHRcdFx0XHRcdHNbcC5yZXBsYWNlKF9jYW1lbEV4cCwgX2NhbWVsRnVuYyldID0gY3MuZ2V0UHJvcGVydHlWYWx1ZShwKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7IC8vc29tZSBicm93c2VycyBiZWhhdmUgZGlmZmVyZW50bHkgLSBjcy5sZW5ndGggaXMgYWx3YXlzIDAsIHNvIHdlIG11c3QgZG8gYSBmb3IuLi5pbiBsb29wLlxuXHRcdFx0XHRcdFx0Zm9yIChpIGluIGNzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChpLmluZGV4T2YoXCJUcmFuc2Zvcm1cIikgPT09IC0xIHx8IF90cmFuc2Zvcm1Qcm9wID09PSBpKSB7IC8vU29tZSB3ZWJraXQgYnJvd3NlcnMgZHVwbGljYXRlIHRyYW5zZm9ybSB2YWx1ZXMsIG9uZSBub24tcHJlZml4ZWQgYW5kIG9uZSBwcmVmaXhlZCAoXCJ0cmFuc2Zvcm1cIiBhbmQgXCJXZWJraXRUcmFuc2Zvcm1cIiksIHNvIHdlIG11c3Qgd2VlZCBvdXQgdGhlIGV4dHJhIG9uZSBoZXJlLlxuXHRcdFx0XHRcdFx0XHRcdHNbaV0gPSBjc1tpXTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmICgoY3MgPSB0LmN1cnJlbnRTdHlsZSB8fCB0LnN0eWxlKSkge1xuXHRcdFx0XHRcdGZvciAoaSBpbiBjcykge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZihpKSA9PT0gXCJzdHJpbmdcIiAmJiBzW2ldID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0c1tpLnJlcGxhY2UoX2NhbWVsRXhwLCBfY2FtZWxGdW5jKV0gPSBjc1tpXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFfc3VwcG9ydHNPcGFjaXR5KSB7XG5cdFx0XHRcdFx0cy5vcGFjaXR5ID0gX2dldElFT3BhY2l0eSh0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0ciA9IF9nZXRUcmFuc2Zvcm0odCwgY3MsIGZhbHNlKTtcblx0XHRcdFx0cy5yb3RhdGlvbiA9IHRyLnJvdGF0aW9uO1xuXHRcdFx0XHRzLnNrZXdYID0gdHIuc2tld1g7XG5cdFx0XHRcdHMuc2NhbGVYID0gdHIuc2NhbGVYO1xuXHRcdFx0XHRzLnNjYWxlWSA9IHRyLnNjYWxlWTtcblx0XHRcdFx0cy54ID0gdHIueDtcblx0XHRcdFx0cy55ID0gdHIueTtcblx0XHRcdFx0aWYgKF9zdXBwb3J0czNEKSB7XG5cdFx0XHRcdFx0cy56ID0gdHIuejtcblx0XHRcdFx0XHRzLnJvdGF0aW9uWCA9IHRyLnJvdGF0aW9uWDtcblx0XHRcdFx0XHRzLnJvdGF0aW9uWSA9IHRyLnJvdGF0aW9uWTtcblx0XHRcdFx0XHRzLnNjYWxlWiA9IHRyLnNjYWxlWjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocy5maWx0ZXJzKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHMuZmlsdGVycztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcztcblx0XHRcdH0sXG5cblx0XHRcdC8vIEBwcml2YXRlIGFuYWx5emVzIHR3byBzdHlsZSBvYmplY3RzIChhcyByZXR1cm5lZCBieSBfZ2V0QWxsU3R5bGVzKCkpIGFuZCBvbmx5IGxvb2tzIGZvciBkaWZmZXJlbmNlcyBiZXR3ZWVuIHRoZW0gdGhhdCBjb250YWluIHR3ZWVuYWJsZSB2YWx1ZXMgKGxpa2UgYSBudW1iZXIgb3IgY29sb3IpLiBJdCByZXR1cm5zIGFuIG9iamVjdCB3aXRoIGEgXCJkaWZzXCIgcHJvcGVydHkgd2hpY2ggcmVmZXJzIHRvIGFuIG9iamVjdCBjb250YWluaW5nIG9ubHkgdGhvc2UgaXNvbGF0ZWQgcHJvcGVydGllcyBhbmQgdmFsdWVzIGZvciB0d2VlbmluZywgYW5kIGEgXCJmaXJzdE1QVFwiIHByb3BlcnR5IHdoaWNoIHJlZmVycyB0byB0aGUgZmlyc3QgTWluaVByb3BUd2VlbiBpbnN0YW5jZSBpbiBhIGxpbmtlZCBsaXN0IHRoYXQgcmVjb3JkZWQgYWxsIHRoZSBzdGFydGluZyB2YWx1ZXMgb2YgdGhlIGRpZmZlcmVudCBwcm9wZXJ0aWVzIHNvIHRoYXQgd2UgY2FuIHJldmVydCB0byB0aGVtIGF0IHRoZSBlbmQgb3IgYmVnaW5uaW5nIG9mIHRoZSB0d2VlbiAtIHdlIGRvbid0IHdhbnQgdGhlIGNhc2NhZGluZyB0byBnZXQgbWVzc2VkIHVwLiBUaGUgZm9yY2VMb29rdXAgcGFyYW1ldGVyIGlzIGFuIG9wdGlvbmFsIGdlbmVyaWMgb2JqZWN0IHdpdGggcHJvcGVydGllcyB0aGF0IHNob3VsZCBiZSBmb3JjZWQgaW50byB0aGUgcmVzdWx0cyAtIHRoaXMgaXMgbmVjZXNzYXJ5IGZvciBjbGFzc05hbWUgdHdlZW5zIHRoYXQgYXJlIG92ZXJ3cml0aW5nIG90aGVycyBiZWNhdXNlIGltYWdpbmUgYSBzY2VuYXJpbyB3aGVyZSBhIHJvbGxvdmVyL3JvbGxvdXQgYWRkcy9yZW1vdmVzIGEgY2xhc3MgYW5kIHRoZSB1c2VyIHN3aXBlcyB0aGUgbW91c2Ugb3ZlciB0aGUgdGFyZ2V0IFNVUEVSIGZhc3QsIHRodXMgbm90aGluZyBhY3R1YWxseSBjaGFuZ2VkIHlldCBhbmQgdGhlIHN1YnNlcXVlbnQgY29tcGFyaXNvbiBvZiB0aGUgcHJvcGVydGllcyB3b3VsZCBpbmRpY2F0ZSB0aGV5IG1hdGNoIChlc3BlY2lhbGx5IHdoZW4gcHggcm91bmRpbmcgaXMgdGFrZW4gaW50byBjb25zaWRlcmF0aW9uKSwgdGh1cyBubyB0d2VlbmluZyBpcyBuZWNlc3NhcnkgZXZlbiB0aG91Z2ggaXQgU0hPVUxEIHR3ZWVuIGFuZCByZW1vdmUgdGhvc2UgcHJvcGVydGllcyBhZnRlciB0aGUgdHdlZW4gKG90aGVyd2lzZSB0aGUgaW5saW5lIHN0eWxlcyB3aWxsIGNvbnRhbWluYXRlIHRoaW5ncykuIFNlZSB0aGUgY2xhc3NOYW1lIFNwZWNpYWxQcm9wIGNvZGUgZm9yIGRldGFpbHMuXG5cdFx0XHRfY3NzRGlmID0gZnVuY3Rpb24odCwgczEsIHMyLCB2YXJzLCBmb3JjZUxvb2t1cCkge1xuXHRcdFx0XHR2YXIgZGlmcyA9IHt9LFxuXHRcdFx0XHRcdHN0eWxlID0gdC5zdHlsZSxcblx0XHRcdFx0XHR2YWwsIHAsIG1wdDtcblx0XHRcdFx0Zm9yIChwIGluIHMyKSB7XG5cdFx0XHRcdFx0aWYgKHAgIT09IFwiY3NzVGV4dFwiKSBpZiAocCAhPT0gXCJsZW5ndGhcIikgaWYgKGlzTmFOKHApKSBpZiAoczFbcF0gIT09ICh2YWwgPSBzMltwXSkgfHwgKGZvcmNlTG9va3VwICYmIGZvcmNlTG9va3VwW3BdKSkgaWYgKHAuaW5kZXhPZihcIk9yaWdpblwiKSA9PT0gLTEpIGlmICh0eXBlb2YodmFsKSA9PT0gXCJudW1iZXJcIiB8fCB0eXBlb2YodmFsKSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0XHRcdFx0ZGlmc1twXSA9ICh2YWwgPT09IFwiYXV0b1wiICYmIChwID09PSBcImxlZnRcIiB8fCBwID09PSBcInRvcFwiKSkgPyBfY2FsY3VsYXRlT2Zmc2V0KHQsIHApIDogKCh2YWwgPT09IFwiXCIgfHwgdmFsID09PSBcImF1dG9cIiB8fCB2YWwgPT09IFwibm9uZVwiKSAmJiB0eXBlb2YoczFbcF0pID09PSBcInN0cmluZ1wiICYmIHMxW3BdLnJlcGxhY2UoX05hTkV4cCwgXCJcIikgIT09IFwiXCIpID8gMCA6IHZhbDsgLy9pZiB0aGUgZW5kaW5nIHZhbHVlIGlzIGRlZmF1bHRpbmcgKFwiXCIgb3IgXCJhdXRvXCIpLCB3ZSBjaGVjayB0aGUgc3RhcnRpbmcgdmFsdWUgYW5kIGlmIGl0IGNhbiBiZSBwYXJzZWQgaW50byBhIG51bWJlciAoYSBzdHJpbmcgd2hpY2ggY291bGQgaGF2ZSBhIHN1ZmZpeCB0b28sIGxpa2UgNzAwcHgpLCB0aGVuIHdlIHN3YXAgaW4gMCBmb3IgXCJcIiBvciBcImF1dG9cIiBzbyB0aGF0IHRoaW5ncyBhY3R1YWxseSB0d2Vlbi5cblx0XHRcdFx0XHRcdGlmIChzdHlsZVtwXSAhPT0gdW5kZWZpbmVkKSB7IC8vZm9yIGNsYXNzTmFtZSB0d2VlbnMsIHdlIG11c3QgcmVtZW1iZXIgd2hpY2ggcHJvcGVydGllcyBhbHJlYWR5IGV4aXN0ZWQgaW5saW5lIC0gdGhlIG9uZXMgdGhhdCBkaWRuJ3Qgc2hvdWxkIGJlIHJlbW92ZWQgd2hlbiB0aGUgdHdlZW4gaXNuJ3QgaW4gcHJvZ3Jlc3MgYmVjYXVzZSB0aGV5IHdlcmUgb25seSBpbnRyb2R1Y2VkIHRvIGZhY2lsaXRhdGUgdGhlIHRyYW5zaXRpb24gYmV0d2VlbiBjbGFzc2VzLlxuXHRcdFx0XHRcdFx0XHRtcHQgPSBuZXcgTWluaVByb3BUd2VlbihzdHlsZSwgcCwgc3R5bGVbcF0sIG1wdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh2YXJzKSB7XG5cdFx0XHRcdFx0Zm9yIChwIGluIHZhcnMpIHsgLy9jb3B5IHByb3BlcnRpZXMgKGV4Y2VwdCBjbGFzc05hbWUpXG5cdFx0XHRcdFx0XHRpZiAocCAhPT0gXCJjbGFzc05hbWVcIikge1xuXHRcdFx0XHRcdFx0XHRkaWZzW3BdID0gdmFyc1twXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtkaWZzOmRpZnMsIGZpcnN0TVBUOm1wdH07XG5cdFx0XHR9LFxuXHRcdFx0X2RpbWVuc2lvbnMgPSB7d2lkdGg6W1wiTGVmdFwiLFwiUmlnaHRcIl0sIGhlaWdodDpbXCJUb3BcIixcIkJvdHRvbVwiXX0sXG5cdFx0XHRfbWFyZ2lucyA9IFtcIm1hcmdpbkxlZnRcIixcIm1hcmdpblJpZ2h0XCIsXCJtYXJnaW5Ub3BcIixcIm1hcmdpbkJvdHRvbVwiXSxcblxuXHRcdFx0LyoqXG5cdFx0XHQgKiBAcHJpdmF0ZSBHZXRzIHRoZSB3aWR0aCBvciBoZWlnaHQgb2YgYW4gZWxlbWVudFxuXHRcdFx0ICogQHBhcmFtIHshT2JqZWN0fSB0IFRhcmdldCBlbGVtZW50XG5cdFx0XHQgKiBAcGFyYW0geyFzdHJpbmd9IHAgUHJvcGVydHkgbmFtZSAoXCJ3aWR0aFwiIG9yIFwiaGVpZ2h0XCIpXG5cdFx0XHQgKiBAcGFyYW0ge09iamVjdD19IGNzIENvbXB1dGVkIHN0eWxlIG9iamVjdCAoaWYgb25lIGV4aXN0cykuIEp1c3QgYSBzcGVlZCBvcHRpbWl6YXRpb24uXG5cdFx0XHQgKiBAcmV0dXJuIHtudW1iZXJ9IERpbWVuc2lvbiAoaW4gcGl4ZWxzKVxuXHRcdFx0ICovXG5cdFx0XHRfZ2V0RGltZW5zaW9uID0gZnVuY3Rpb24odCwgcCwgY3MpIHtcblx0XHRcdFx0dmFyIHYgPSBwYXJzZUZsb2F0KChwID09PSBcIndpZHRoXCIpID8gdC5vZmZzZXRXaWR0aCA6IHQub2Zmc2V0SGVpZ2h0KSxcblx0XHRcdFx0XHRhID0gX2RpbWVuc2lvbnNbcF0sXG5cdFx0XHRcdFx0aSA9IGEubGVuZ3RoO1xuXHRcdFx0XHRjcyA9IGNzIHx8IF9nZXRDb21wdXRlZFN0eWxlKHQsIG51bGwpO1xuXHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHR2IC09IHBhcnNlRmxvYXQoIF9nZXRTdHlsZSh0LCBcInBhZGRpbmdcIiArIGFbaV0sIGNzLCB0cnVlKSApIHx8IDA7XG5cdFx0XHRcdFx0diAtPSBwYXJzZUZsb2F0KCBfZ2V0U3R5bGUodCwgXCJib3JkZXJcIiArIGFbaV0gKyBcIldpZHRoXCIsIGNzLCB0cnVlKSApIHx8IDA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHY7XG5cdFx0XHR9LFxuXG5cdFx0XHQvLyBAcHJpdmF0ZSBQYXJzZXMgcG9zaXRpb24tcmVsYXRlZCBjb21wbGV4IHN0cmluZ3MgbGlrZSBcInRvcCBsZWZ0XCIgb3IgXCI1MHB4IDEwcHhcIiBvciBcIjcwJSAyMCVcIiwgZXRjLiB3aGljaCBhcmUgdXNlZCBmb3IgdGhpbmdzIGxpa2UgdHJhbnNmb3JtT3JpZ2luIG9yIGJhY2tncm91bmRQb3NpdGlvbi4gT3B0aW9uYWxseSBkZWNvcmF0ZXMgYSBzdXBwbGllZCBvYmplY3QgKHJlY09iaikgd2l0aCB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6IFwib3hcIiAob2Zmc2V0WCksIFwib3lcIiAob2Zmc2V0WSksIFwib3hwXCIgKGlmIHRydWUsIFwib3hcIiBpcyBhIHBlcmNlbnRhZ2Ugbm90IGEgcGl4ZWwgdmFsdWUpLCBhbmQgXCJveHlcIiAoaWYgdHJ1ZSwgXCJveVwiIGlzIGEgcGVyY2VudGFnZSBub3QgYSBwaXhlbCB2YWx1ZSlcblx0XHRcdF9wYXJzZVBvc2l0aW9uID0gZnVuY3Rpb24odiwgcmVjT2JqKSB7XG5cdFx0XHRcdGlmICh2ID09PSBcImNvbnRhaW5cIiB8fCB2ID09PSBcImF1dG9cIiB8fCB2ID09PSBcImF1dG8gYXV0b1wiKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHYgKyBcIiBcIjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodiA9PSBudWxsIHx8IHYgPT09IFwiXCIpIHsgLy9ub3RlOiBGaXJlZm94IHVzZXMgXCJhdXRvIGF1dG9cIiBhcyBkZWZhdWx0IHdoZXJlYXMgQ2hyb21lIHVzZXMgXCJhdXRvXCIuXG5cdFx0XHRcdFx0diA9IFwiMCAwXCI7XG5cdFx0XHRcdH1cblx0XHRcdFx0dmFyIGEgPSB2LnNwbGl0KFwiIFwiKSxcblx0XHRcdFx0XHR4ID0gKHYuaW5kZXhPZihcImxlZnRcIikgIT09IC0xKSA/IFwiMCVcIiA6ICh2LmluZGV4T2YoXCJyaWdodFwiKSAhPT0gLTEpID8gXCIxMDAlXCIgOiBhWzBdLFxuXHRcdFx0XHRcdHkgPSAodi5pbmRleE9mKFwidG9wXCIpICE9PSAtMSkgPyBcIjAlXCIgOiAodi5pbmRleE9mKFwiYm90dG9tXCIpICE9PSAtMSkgPyBcIjEwMCVcIiA6IGFbMV07XG5cdFx0XHRcdGlmICh5ID09IG51bGwpIHtcblx0XHRcdFx0XHR5ID0gKHggPT09IFwiY2VudGVyXCIpID8gXCI1MCVcIiA6IFwiMFwiO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHkgPT09IFwiY2VudGVyXCIpIHtcblx0XHRcdFx0XHR5ID0gXCI1MCVcIjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoeCA9PT0gXCJjZW50ZXJcIiB8fCAoaXNOYU4ocGFyc2VGbG9hdCh4KSkgJiYgKHggKyBcIlwiKS5pbmRleE9mKFwiPVwiKSA9PT0gLTEpKSB7IC8vcmVtZW1iZXIsIHRoZSB1c2VyIGNvdWxkIGZsaXAtZmxvcCB0aGUgdmFsdWVzIGFuZCBzYXkgXCJib3R0b20gY2VudGVyXCIgb3IgXCJjZW50ZXIgYm90dG9tXCIsIGV0Yy4gXCJjZW50ZXJcIiBpcyBhbWJpZ3VvdXMgYmVjYXVzZSBpdCBjb3VsZCBiZSB1c2VkIHRvIGRlc2NyaWJlIGhvcml6b250YWwgb3IgdmVydGljYWwsIGhlbmNlIHRoZSBpc05hTigpLiBJZiB0aGVyZSdzIGFuIFwiPVwiIHNpZ24gaW4gdGhlIHZhbHVlLCBpdCdzIHJlbGF0aXZlLlxuXHRcdFx0XHRcdHggPSBcIjUwJVwiO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHYgPSB4ICsgXCIgXCIgKyB5ICsgKChhLmxlbmd0aCA+IDIpID8gXCIgXCIgKyBhWzJdIDogXCJcIik7XG5cdFx0XHRcdGlmIChyZWNPYmopIHtcblx0XHRcdFx0XHRyZWNPYmoub3hwID0gKHguaW5kZXhPZihcIiVcIikgIT09IC0xKTtcblx0XHRcdFx0XHRyZWNPYmoub3lwID0gKHkuaW5kZXhPZihcIiVcIikgIT09IC0xKTtcblx0XHRcdFx0XHRyZWNPYmoub3hyID0gKHguY2hhckF0KDEpID09PSBcIj1cIik7XG5cdFx0XHRcdFx0cmVjT2JqLm95ciA9ICh5LmNoYXJBdCgxKSA9PT0gXCI9XCIpO1xuXHRcdFx0XHRcdHJlY09iai5veCA9IHBhcnNlRmxvYXQoeC5yZXBsYWNlKF9OYU5FeHAsIFwiXCIpKTtcblx0XHRcdFx0XHRyZWNPYmoub3kgPSBwYXJzZUZsb2F0KHkucmVwbGFjZShfTmFORXhwLCBcIlwiKSk7XG5cdFx0XHRcdFx0cmVjT2JqLnYgPSB2O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZWNPYmogfHwgdjtcblx0XHRcdH0sXG5cblx0XHRcdC8qKlxuXHRcdFx0ICogQHByaXZhdGUgVGFrZXMgYW4gZW5kaW5nIHZhbHVlICh0eXBpY2FsbHkgYSBzdHJpbmcsIGJ1dCBjYW4gYmUgYSBudW1iZXIpIGFuZCBhIHN0YXJ0aW5nIHZhbHVlIGFuZCByZXR1cm5zIHRoZSBjaGFuZ2UgYmV0d2VlbiB0aGUgdHdvLCBsb29raW5nIGZvciByZWxhdGl2ZSB2YWx1ZSBpbmRpY2F0b3JzIGxpa2UgKz0gYW5kIC09IGFuZCBpdCBhbHNvIGlnbm9yZXMgc3VmZml4ZXMgKGJ1dCBtYWtlIHN1cmUgdGhlIGVuZGluZyB2YWx1ZSBzdGFydHMgd2l0aCBhIG51bWJlciBvciArPS8tPSBhbmQgdGhhdCB0aGUgc3RhcnRpbmcgdmFsdWUgaXMgYSBOVU1CRVIhKVxuXHRcdFx0ICogQHBhcmFtIHsobnVtYmVyfHN0cmluZyl9IGUgRW5kIHZhbHVlIHdoaWNoIGlzIHR5cGljYWxseSBhIHN0cmluZywgYnV0IGNvdWxkIGJlIGEgbnVtYmVyXG5cdFx0XHQgKiBAcGFyYW0geyhudW1iZXJ8c3RyaW5nKX0gYiBCZWdpbm5pbmcgdmFsdWUgd2hpY2ggaXMgdHlwaWNhbGx5IGEgc3RyaW5nIGJ1dCBjb3VsZCBiZSBhIG51bWJlclxuXHRcdFx0ICogQHJldHVybiB7bnVtYmVyfSBBbW91bnQgb2YgY2hhbmdlIGJldHdlZW4gdGhlIGJlZ2lubmluZyBhbmQgZW5kaW5nIHZhbHVlcyAocmVsYXRpdmUgdmFsdWVzIHRoYXQgaGF2ZSBhIFwiKz1cIiBvciBcIi09XCIgYXJlIHJlY29nbml6ZWQpXG5cdFx0XHQgKi9cblx0XHRcdF9wYXJzZUNoYW5nZSA9IGZ1bmN0aW9uKGUsIGIpIHtcblx0XHRcdFx0cmV0dXJuICh0eXBlb2YoZSkgPT09IFwic3RyaW5nXCIgJiYgZS5jaGFyQXQoMSkgPT09IFwiPVwiKSA/IHBhcnNlSW50KGUuY2hhckF0KDApICsgXCIxXCIsIDEwKSAqIHBhcnNlRmxvYXQoZS5zdWJzdHIoMikpIDogcGFyc2VGbG9hdChlKSAtIHBhcnNlRmxvYXQoYik7XG5cdFx0XHR9LFxuXG5cdFx0XHQvKipcblx0XHRcdCAqIEBwcml2YXRlIFRha2VzIGEgdmFsdWUgYW5kIGEgZGVmYXVsdCBudW1iZXIsIGNoZWNrcyBpZiB0aGUgdmFsdWUgaXMgcmVsYXRpdmUsIG51bGwsIG9yIG51bWVyaWMgYW5kIHNwaXRzIGJhY2sgYSBub3JtYWxpemVkIG51bWJlciBhY2NvcmRpbmdseS4gUHJpbWFyaWx5IHVzZWQgaW4gdGhlIF9wYXJzZVRyYW5zZm9ybSgpIGZ1bmN0aW9uLlxuXHRcdFx0ICogQHBhcmFtIHtPYmplY3R9IHYgVmFsdWUgdG8gYmUgcGFyc2VkXG5cdFx0XHQgKiBAcGFyYW0geyFudW1iZXJ9IGQgRGVmYXVsdCB2YWx1ZSAod2hpY2ggaXMgYWxzbyB1c2VkIGZvciByZWxhdGl2ZSBjYWxjdWxhdGlvbnMgaWYgXCIrPVwiIG9yIFwiLT1cIiBpcyBmb3VuZCBpbiB0aGUgZmlyc3QgcGFyYW1ldGVyKVxuXHRcdFx0ICogQHJldHVybiB7bnVtYmVyfSBQYXJzZWQgdmFsdWVcblx0XHRcdCAqL1xuXHRcdFx0X3BhcnNlVmFsID0gZnVuY3Rpb24odiwgZCkge1xuXHRcdFx0XHRyZXR1cm4gKHYgPT0gbnVsbCkgPyBkIDogKHR5cGVvZih2KSA9PT0gXCJzdHJpbmdcIiAmJiB2LmNoYXJBdCgxKSA9PT0gXCI9XCIpID8gcGFyc2VJbnQodi5jaGFyQXQoMCkgKyBcIjFcIiwgMTApICogcGFyc2VGbG9hdCh2LnN1YnN0cigyKSkgKyBkIDogcGFyc2VGbG9hdCh2KTtcblx0XHRcdH0sXG5cblx0XHRcdC8qKlxuXHRcdFx0ICogQHByaXZhdGUgVHJhbnNsYXRlcyBzdHJpbmdzIGxpa2UgXCI0MGRlZ1wiIG9yIFwiNDBcIiBvciA0MHJhZFwiIG9yIFwiKz00MGRlZ1wiIG9yIFwiMjcwX3Nob3J0XCIgb3IgXCItOTBfY3dcIiBvciBcIis9NDVfY2N3XCIgdG8gYSBudW1lcmljIHJhZGlhbiBhbmdsZS4gT2YgY291cnNlIGEgc3RhcnRpbmcvZGVmYXVsdCB2YWx1ZSBtdXN0IGJlIGZlZCBpbiB0b28gc28gdGhhdCByZWxhdGl2ZSB2YWx1ZXMgY2FuIGJlIGNhbGN1bGF0ZWQgcHJvcGVybHkuXG5cdFx0XHQgKiBAcGFyYW0ge09iamVjdH0gdiBWYWx1ZSB0byBiZSBwYXJzZWRcblx0XHRcdCAqIEBwYXJhbSB7IW51bWJlcn0gZCBEZWZhdWx0IHZhbHVlICh3aGljaCBpcyBhbHNvIHVzZWQgZm9yIHJlbGF0aXZlIGNhbGN1bGF0aW9ucyBpZiBcIis9XCIgb3IgXCItPVwiIGlzIGZvdW5kIGluIHRoZSBmaXJzdCBwYXJhbWV0ZXIpXG5cdFx0XHQgKiBAcGFyYW0ge3N0cmluZz19IHAgcHJvcGVydHkgbmFtZSBmb3IgZGlyZWN0aW9uYWxFbmQgKG9wdGlvbmFsIC0gb25seSB1c2VkIHdoZW4gdGhlIHBhcnNlZCB2YWx1ZSBpcyBkaXJlY3Rpb25hbCAoXCJfc2hvcnRcIiwgXCJfY3dcIiwgb3IgXCJfY2N3XCIgc3VmZml4KS4gV2UgbmVlZCBhIHdheSB0byBzdG9yZSB0aGUgdW5jb21wZW5zYXRlZCB2YWx1ZSBzbyB0aGF0IGF0IHRoZSBlbmQgb2YgdGhlIHR3ZWVuLCB3ZSBzZXQgaXQgdG8gZXhhY3RseSB3aGF0IHdhcyByZXF1ZXN0ZWQgd2l0aCBubyBkaXJlY3Rpb25hbCBjb21wZW5zYXRpb24pLiBQcm9wZXJ0eSBuYW1lIHdvdWxkIGJlIFwicm90YXRpb25cIiwgXCJyb3RhdGlvblhcIiwgb3IgXCJyb3RhdGlvbllcIlxuXHRcdFx0ICogQHBhcmFtIHtPYmplY3Q9fSBkaXJlY3Rpb25hbEVuZCBBbiBvYmplY3QgdGhhdCB3aWxsIHN0b3JlIHRoZSByYXcgZW5kIHZhbHVlcyBmb3IgZGlyZWN0aW9uYWwgYW5nbGVzIChcIl9zaG9ydFwiLCBcIl9jd1wiLCBvciBcIl9jY3dcIiBzdWZmaXgpLiBXZSBuZWVkIGEgd2F5IHRvIHN0b3JlIHRoZSB1bmNvbXBlbnNhdGVkIHZhbHVlIHNvIHRoYXQgYXQgdGhlIGVuZCBvZiB0aGUgdHdlZW4sIHdlIHNldCBpdCB0byBleGFjdGx5IHdoYXQgd2FzIHJlcXVlc3RlZCB3aXRoIG5vIGRpcmVjdGlvbmFsIGNvbXBlbnNhdGlvbi5cblx0XHRcdCAqIEByZXR1cm4ge251bWJlcn0gcGFyc2VkIGFuZ2xlIGluIHJhZGlhbnNcblx0XHRcdCAqL1xuXHRcdFx0X3BhcnNlQW5nbGUgPSBmdW5jdGlvbih2LCBkLCBwLCBkaXJlY3Rpb25hbEVuZCkge1xuXHRcdFx0XHR2YXIgbWluID0gMC4wMDAwMDEsXG5cdFx0XHRcdFx0Y2FwLCBzcGxpdCwgZGlmLCByZXN1bHQsIGlzUmVsYXRpdmU7XG5cdFx0XHRcdGlmICh2ID09IG51bGwpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBkO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZih2KSA9PT0gXCJudW1iZXJcIikge1xuXHRcdFx0XHRcdHJlc3VsdCA9IHY7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2FwID0gMzYwO1xuXHRcdFx0XHRcdHNwbGl0ID0gdi5zcGxpdChcIl9cIik7XG5cdFx0XHRcdFx0aXNSZWxhdGl2ZSA9ICh2LmNoYXJBdCgxKSA9PT0gXCI9XCIpO1xuXHRcdFx0XHRcdGRpZiA9IChpc1JlbGF0aXZlID8gcGFyc2VJbnQodi5jaGFyQXQoMCkgKyBcIjFcIiwgMTApICogcGFyc2VGbG9hdChzcGxpdFswXS5zdWJzdHIoMikpIDogcGFyc2VGbG9hdChzcGxpdFswXSkpICogKCh2LmluZGV4T2YoXCJyYWRcIikgPT09IC0xKSA/IDEgOiBfUkFEMkRFRykgLSAoaXNSZWxhdGl2ZSA/IDAgOiBkKTtcblx0XHRcdFx0XHRpZiAoc3BsaXQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRpZiAoZGlyZWN0aW9uYWxFbmQpIHtcblx0XHRcdFx0XHRcdFx0ZGlyZWN0aW9uYWxFbmRbcF0gPSBkICsgZGlmO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHYuaW5kZXhPZihcInNob3J0XCIpICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRkaWYgPSBkaWYgJSBjYXA7XG5cdFx0XHRcdFx0XHRcdGlmIChkaWYgIT09IGRpZiAlIChjYXAgLyAyKSkge1xuXHRcdFx0XHRcdFx0XHRcdGRpZiA9IChkaWYgPCAwKSA/IGRpZiArIGNhcCA6IGRpZiAtIGNhcDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHYuaW5kZXhPZihcIl9jd1wiKSAhPT0gLTEgJiYgZGlmIDwgMCkge1xuXHRcdFx0XHRcdFx0XHRkaWYgPSAoKGRpZiArIGNhcCAqIDk5OTk5OTk5OTkpICUgY2FwKSAtICgoZGlmIC8gY2FwKSB8IDApICogY2FwO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICh2LmluZGV4T2YoXCJjY3dcIikgIT09IC0xICYmIGRpZiA+IDApIHtcblx0XHRcdFx0XHRcdFx0ZGlmID0gKChkaWYgLSBjYXAgKiA5OTk5OTk5OTk5KSAlIGNhcCkgLSAoKGRpZiAvIGNhcCkgfCAwKSAqIGNhcDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzdWx0ID0gZCArIGRpZjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVzdWx0IDwgbWluICYmIHJlc3VsdCA+IC1taW4pIHtcblx0XHRcdFx0XHRyZXN1bHQgPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9LFxuXG5cdFx0XHRfY29sb3JMb29rdXAgPSB7YXF1YTpbMCwyNTUsMjU1XSxcblx0XHRcdFx0bGltZTpbMCwyNTUsMF0sXG5cdFx0XHRcdHNpbHZlcjpbMTkyLDE5MiwxOTJdLFxuXHRcdFx0XHRibGFjazpbMCwwLDBdLFxuXHRcdFx0XHRtYXJvb246WzEyOCwwLDBdLFxuXHRcdFx0XHR0ZWFsOlswLDEyOCwxMjhdLFxuXHRcdFx0XHRibHVlOlswLDAsMjU1XSxcblx0XHRcdFx0bmF2eTpbMCwwLDEyOF0sXG5cdFx0XHRcdHdoaXRlOlsyNTUsMjU1LDI1NV0sXG5cdFx0XHRcdGZ1Y2hzaWE6WzI1NSwwLDI1NV0sXG5cdFx0XHRcdG9saXZlOlsxMjgsMTI4LDBdLFxuXHRcdFx0XHR5ZWxsb3c6WzI1NSwyNTUsMF0sXG5cdFx0XHRcdG9yYW5nZTpbMjU1LDE2NSwwXSxcblx0XHRcdFx0Z3JheTpbMTI4LDEyOCwxMjhdLFxuXHRcdFx0XHRwdXJwbGU6WzEyOCwwLDEyOF0sXG5cdFx0XHRcdGdyZWVuOlswLDEyOCwwXSxcblx0XHRcdFx0cmVkOlsyNTUsMCwwXSxcblx0XHRcdFx0cGluazpbMjU1LDE5MiwyMDNdLFxuXHRcdFx0XHRjeWFuOlswLDI1NSwyNTVdLFxuXHRcdFx0XHR0cmFuc3BhcmVudDpbMjU1LDI1NSwyNTUsMF19LFxuXG5cdFx0XHRfaHVlID0gZnVuY3Rpb24oaCwgbTEsIG0yKSB7XG5cdFx0XHRcdGggPSAoaCA8IDApID8gaCArIDEgOiAoaCA+IDEpID8gaCAtIDEgOiBoO1xuXHRcdFx0XHRyZXR1cm4gKCgoKGggKiA2IDwgMSkgPyBtMSArIChtMiAtIG0xKSAqIGggKiA2IDogKGggPCAwLjUpID8gbTIgOiAoaCAqIDMgPCAyKSA/IG0xICsgKG0yIC0gbTEpICogKDIgLyAzIC0gaCkgKiA2IDogbTEpICogMjU1KSArIDAuNSkgfCAwO1xuXHRcdFx0fSxcblxuXHRcdFx0LyoqXG5cdFx0XHQgKiBAcHJpdmF0ZSBQYXJzZXMgYSBjb2xvciAobGlrZSAjOUYwLCAjRkY5OTAwLCByZ2IoMjU1LDUxLDE1Mykgb3IgaHNsKDEwOCwgNTAlLCAxMCUpKSBpbnRvIGFuIGFycmF5IHdpdGggMyBlbGVtZW50cyBmb3IgcmVkLCBncmVlbiwgYW5kIGJsdWUgb3IgaWYgdG9IU0wgcGFyYW1ldGVyIGlzIHRydWUsIGl0IHdpbGwgcG9wdWxhdGUgdGhlIGFycmF5IHdpdGggaHVlLCBzYXR1cmF0aW9uLCBhbmQgbGlnaHRuZXNzIHZhbHVlcy4gSWYgYSByZWxhdGl2ZSB2YWx1ZSBpcyBmb3VuZCBpbiBhbiBoc2woKSBvciBoc2xhKCkgc3RyaW5nLCBpdCB3aWxsIHByZXNlcnZlIHRob3NlIHJlbGF0aXZlIHByZWZpeGVzIGFuZCBhbGwgdGhlIHZhbHVlcyBpbiB0aGUgYXJyYXkgd2lsbCBiZSBzdHJpbmdzIGluc3RlYWQgb2YgbnVtYmVycyAoaW4gYWxsIG90aGVyIGNhc2VzIGl0IHdpbGwgYmUgcG9wdWxhdGVkIHdpdGggbnVtYmVycykuXG5cdFx0XHQgKiBAcGFyYW0geyhzdHJpbmd8bnVtYmVyKX0gdiBUaGUgdmFsdWUgdGhlIHNob3VsZCBiZSBwYXJzZWQgd2hpY2ggY291bGQgYmUgYSBzdHJpbmcgbGlrZSAjOUYwIG9yIHJnYigyNTUsMTAyLDUxKSBvciByZ2JhKDI1NSwwLDAsMC41KSBvciBpdCBjb3VsZCBiZSBhIG51bWJlciBsaWtlIDB4RkYwMENDIG9yIGV2ZW4gYSBuYW1lZCBjb2xvciBsaWtlIHJlZCwgYmx1ZSwgcHVycGxlLCBldGMuXG5cdFx0XHQgKiBAcGFyYW0geyhib29sZWFuKX0gdG9IU0wgSWYgdHJ1ZSwgYW4gaHNsKCkgb3IgaHNsYSgpIHZhbHVlIHdpbGwgYmUgcmV0dXJuZWQgaW5zdGVhZCBvZiByZ2IoKSBvciByZ2JhKClcblx0XHRcdCAqIEByZXR1cm4ge0FycmF5LjxudW1iZXI+fSBBbiBhcnJheSBjb250YWluaW5nIHJlZCwgZ3JlZW4sIGFuZCBibHVlIChhbmQgb3B0aW9uYWxseSBhbHBoYSkgaW4gdGhhdCBvcmRlciwgb3IgaWYgdGhlIHRvSFNMIHBhcmFtZXRlciB3YXMgdHJ1ZSwgdGhlIGFycmF5IHdpbGwgY29udGFpbiBodWUsIHNhdHVyYXRpb24gYW5kIGxpZ2h0bmVzcyAoYW5kIG9wdGlvbmFsbHkgYWxwaGEpIGluIHRoYXQgb3JkZXIuIEFsd2F5cyBudW1iZXJzIHVubGVzcyB0aGVyZSdzIGEgcmVsYXRpdmUgcHJlZml4IGZvdW5kIGluIGFuIGhzbCgpIG9yIGhzbGEoKSBzdHJpbmcgYW5kIHRvSFNMIGlzIHRydWUuXG5cdFx0XHQgKi9cblx0XHRcdF9wYXJzZUNvbG9yID0gQ1NTUGx1Z2luLnBhcnNlQ29sb3IgPSBmdW5jdGlvbih2LCB0b0hTTCkge1xuXHRcdFx0XHR2YXIgYSwgciwgZywgYiwgaCwgcywgbCwgbWF4LCBtaW4sIGQsIHdhc0hTTDtcblx0XHRcdFx0aWYgKCF2KSB7XG5cdFx0XHRcdFx0YSA9IF9jb2xvckxvb2t1cC5ibGFjaztcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YodikgPT09IFwibnVtYmVyXCIpIHtcblx0XHRcdFx0XHRhID0gW3YgPj4gMTYsICh2ID4+IDgpICYgMjU1LCB2ICYgMjU1XTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAodi5jaGFyQXQodi5sZW5ndGggLSAxKSA9PT0gXCIsXCIpIHsgLy9zb21ldGltZXMgYSB0cmFpbGluZyBjb21tYSBpcyBpbmNsdWRlZCBhbmQgd2Ugc2hvdWxkIGNob3AgaXQgb2ZmICh0eXBpY2FsbHkgZnJvbSBhIGNvbW1hLWRlbGltaXRlZCBsaXN0IG9mIHZhbHVlcyBsaWtlIGEgdGV4dFNoYWRvdzpcIjJweCAycHggMnB4IGJsdWUsIDVweCA1cHggNXB4IHJnYigyNTUsMCwwKVwiIC0gaW4gdGhpcyBleGFtcGxlIFwiYmx1ZSxcIiBoYXMgYSB0cmFpbGluZyBjb21tYS4gV2UgY291bGQgc3RyaXAgaXQgb3V0IGluc2lkZSBwYXJzZUNvbXBsZXgoKSBidXQgd2UnZCBuZWVkIHRvIGRvIGl0IHRvIHRoZSBiZWdpbm5pbmcgYW5kIGVuZGluZyB2YWx1ZXMgcGx1cyBpdCB3b3VsZG4ndCBwcm92aWRlIHByb3RlY3Rpb24gZnJvbSBvdGhlciBwb3RlbnRpYWwgc2NlbmFyaW9zIGxpa2UgaWYgdGhlIHVzZXIgcGFzc2VzIGluIGEgc2ltaWxhciB2YWx1ZS5cblx0XHRcdFx0XHRcdHYgPSB2LnN1YnN0cigwLCB2Lmxlbmd0aCAtIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoX2NvbG9yTG9va3VwW3ZdKSB7XG5cdFx0XHRcdFx0XHRhID0gX2NvbG9yTG9va3VwW3ZdO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodi5jaGFyQXQoMCkgPT09IFwiI1wiKSB7XG5cdFx0XHRcdFx0XHRpZiAodi5sZW5ndGggPT09IDQpIHsgLy9mb3Igc2hvcnRoYW5kIGxpa2UgIzlGMFxuXHRcdFx0XHRcdFx0XHRyID0gdi5jaGFyQXQoMSk7XG5cdFx0XHRcdFx0XHRcdGcgPSB2LmNoYXJBdCgyKTtcblx0XHRcdFx0XHRcdFx0YiA9IHYuY2hhckF0KDMpO1xuXHRcdFx0XHRcdFx0XHR2ID0gXCIjXCIgKyByICsgciArIGcgKyBnICsgYiArIGI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR2ID0gcGFyc2VJbnQodi5zdWJzdHIoMSksIDE2KTtcblx0XHRcdFx0XHRcdGEgPSBbdiA+PiAxNiwgKHYgPj4gOCkgJiAyNTUsIHYgJiAyNTVdO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodi5zdWJzdHIoMCwgMykgPT09IFwiaHNsXCIpIHtcblx0XHRcdFx0XHRcdGEgPSB3YXNIU0wgPSB2Lm1hdGNoKF9udW1FeHApO1xuXHRcdFx0XHRcdFx0aWYgKCF0b0hTTCkge1xuXHRcdFx0XHRcdFx0XHRoID0gKE51bWJlcihhWzBdKSAlIDM2MCkgLyAzNjA7XG5cdFx0XHRcdFx0XHRcdHMgPSBOdW1iZXIoYVsxXSkgLyAxMDA7XG5cdFx0XHRcdFx0XHRcdGwgPSBOdW1iZXIoYVsyXSkgLyAxMDA7XG5cdFx0XHRcdFx0XHRcdGcgPSAobCA8PSAwLjUpID8gbCAqIChzICsgMSkgOiBsICsgcyAtIGwgKiBzO1xuXHRcdFx0XHRcdFx0XHRyID0gbCAqIDIgLSBnO1xuXHRcdFx0XHRcdFx0XHRpZiAoYS5sZW5ndGggPiAzKSB7XG5cdFx0XHRcdFx0XHRcdFx0YVszXSA9IE51bWJlcih2WzNdKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRhWzBdID0gX2h1ZShoICsgMSAvIDMsIHIsIGcpO1xuXHRcdFx0XHRcdFx0XHRhWzFdID0gX2h1ZShoLCByLCBnKTtcblx0XHRcdFx0XHRcdFx0YVsyXSA9IF9odWUoaCAtIDEgLyAzLCByLCBnKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodi5pbmRleE9mKFwiPVwiKSAhPT0gLTEpIHsgLy9pZiByZWxhdGl2ZSB2YWx1ZXMgYXJlIGZvdW5kLCBqdXN0IHJldHVybiB0aGUgcmF3IHN0cmluZ3Mgd2l0aCB0aGUgcmVsYXRpdmUgcHJlZml4ZXMgaW4gcGxhY2UuXG5cdFx0XHRcdFx0XHRcdHJldHVybiB2Lm1hdGNoKF9yZWxOdW1FeHApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhID0gdi5tYXRjaChfbnVtRXhwKSB8fCBfY29sb3JMb29rdXAudHJhbnNwYXJlbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFbMF0gPSBOdW1iZXIoYVswXSk7XG5cdFx0XHRcdFx0YVsxXSA9IE51bWJlcihhWzFdKTtcblx0XHRcdFx0XHRhWzJdID0gTnVtYmVyKGFbMl0pO1xuXHRcdFx0XHRcdGlmIChhLmxlbmd0aCA+IDMpIHtcblx0XHRcdFx0XHRcdGFbM10gPSBOdW1iZXIoYVszXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0b0hTTCAmJiAhd2FzSFNMKSB7XG5cdFx0XHRcdFx0ciA9IGFbMF0gLyAyNTU7XG5cdFx0XHRcdFx0ZyA9IGFbMV0gLyAyNTU7XG5cdFx0XHRcdFx0YiA9IGFbMl0gLyAyNTU7XG5cdFx0XHRcdFx0bWF4ID0gTWF0aC5tYXgociwgZywgYik7XG5cdFx0XHRcdFx0bWluID0gTWF0aC5taW4ociwgZywgYik7XG5cdFx0XHRcdFx0bCA9IChtYXggKyBtaW4pIC8gMjtcblx0XHRcdFx0XHRpZiAobWF4ID09PSBtaW4pIHtcblx0XHRcdFx0XHRcdGggPSBzID0gMDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZCA9IG1heCAtIG1pbjtcblx0XHRcdFx0XHRcdHMgPSBsID4gMC41ID8gZCAvICgyIC0gbWF4IC0gbWluKSA6IGQgLyAobWF4ICsgbWluKTtcblx0XHRcdFx0XHRcdGggPSAobWF4ID09PSByKSA/IChnIC0gYikgLyBkICsgKGcgPCBiID8gNiA6IDApIDogKG1heCA9PT0gZykgPyAoYiAtIHIpIC8gZCArIDIgOiAociAtIGcpIC8gZCArIDQ7XG5cdFx0XHRcdFx0XHRoICo9IDYwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhWzBdID0gKGggKyAwLjUpIHwgMDtcblx0XHRcdFx0XHRhWzFdID0gKHMgKiAxMDAgKyAwLjUpIHwgMDtcblx0XHRcdFx0XHRhWzJdID0gKGwgKiAxMDAgKyAwLjUpIHwgMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYTtcblx0XHRcdH0sXG5cdFx0XHRfZm9ybWF0Q29sb3JzID0gZnVuY3Rpb24ocywgdG9IU0wpIHtcblx0XHRcdFx0dmFyIGNvbG9ycyA9IHMubWF0Y2goX2NvbG9yRXhwKSB8fCBbXSxcblx0XHRcdFx0XHRjaGFySW5kZXggPSAwLFxuXHRcdFx0XHRcdHBhcnNlZCA9IGNvbG9ycy5sZW5ndGggPyBcIlwiIDogcyxcblx0XHRcdFx0XHRpLCBjb2xvciwgdGVtcDtcblx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGNvbG9ycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbG9yID0gY29sb3JzW2ldO1xuXHRcdFx0XHRcdHRlbXAgPSBzLnN1YnN0cihjaGFySW5kZXgsIHMuaW5kZXhPZihjb2xvciwgY2hhckluZGV4KS1jaGFySW5kZXgpO1xuXHRcdFx0XHRcdGNoYXJJbmRleCArPSB0ZW1wLmxlbmd0aCArIGNvbG9yLmxlbmd0aDtcblx0XHRcdFx0XHRjb2xvciA9IF9wYXJzZUNvbG9yKGNvbG9yLCB0b0hTTCk7XG5cdFx0XHRcdFx0aWYgKGNvbG9yLmxlbmd0aCA9PT0gMykge1xuXHRcdFx0XHRcdFx0Y29sb3IucHVzaCgxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cGFyc2VkICs9IHRlbXAgKyAodG9IU0wgPyBcImhzbGEoXCIgKyBjb2xvclswXSArIFwiLFwiICsgY29sb3JbMV0gKyBcIiUsXCIgKyBjb2xvclsyXSArIFwiJSxcIiArIGNvbG9yWzNdIDogXCJyZ2JhKFwiICsgY29sb3Iuam9pbihcIixcIikpICsgXCIpXCI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHRcdH0sXG5cdFx0XHRfY29sb3JFeHAgPSBcIig/OlxcXFxiKD86KD86cmdifHJnYmF8aHNsfGhzbGEpXFxcXCguKz9cXFxcKSl8XFxcXEIjLis/XFxcXGJcIjsgLy93ZSdsbCBkeW5hbWljYWxseSBidWlsZCB0aGlzIFJlZ3VsYXIgRXhwcmVzc2lvbiB0byBjb25zZXJ2ZSBmaWxlIHNpemUuIEFmdGVyIGJ1aWxkaW5nIGl0LCBpdCB3aWxsIGJlIGFibGUgdG8gZmluZCByZ2IoKSwgcmdiYSgpLCAjIChoZXhhZGVjaW1hbCksIGFuZCBuYW1lZCBjb2xvciB2YWx1ZXMgbGlrZSByZWQsIGJsdWUsIHB1cnBsZSwgZXRjLlxuXG5cdFx0Zm9yIChwIGluIF9jb2xvckxvb2t1cCkge1xuXHRcdFx0X2NvbG9yRXhwICs9IFwifFwiICsgcCArIFwiXFxcXGJcIjtcblx0XHR9XG5cdFx0X2NvbG9yRXhwID0gbmV3IFJlZ0V4cChfY29sb3JFeHArXCIpXCIsIFwiZ2lcIik7XG5cblx0XHRDU1NQbHVnaW4uY29sb3JTdHJpbmdGaWx0ZXIgPSBmdW5jdGlvbihhKSB7XG5cdFx0XHR2YXIgY29tYmluZWQgPSBhWzBdICsgYVsxXSxcblx0XHRcdFx0dG9IU0w7XG5cdFx0XHRfY29sb3JFeHAubGFzdEluZGV4ID0gMDtcblx0XHRcdGlmIChfY29sb3JFeHAudGVzdChjb21iaW5lZCkpIHtcblx0XHRcdFx0dG9IU0wgPSAoY29tYmluZWQuaW5kZXhPZihcImhzbChcIikgIT09IC0xIHx8IGNvbWJpbmVkLmluZGV4T2YoXCJoc2xhKFwiKSAhPT0gLTEpO1xuXHRcdFx0XHRhWzBdID0gX2Zvcm1hdENvbG9ycyhhWzBdLCB0b0hTTCk7XG5cdFx0XHRcdGFbMV0gPSBfZm9ybWF0Q29sb3JzKGFbMV0sIHRvSFNMKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKCFUd2VlbkxpdGUuZGVmYXVsdFN0cmluZ0ZpbHRlcikge1xuXHRcdFx0VHdlZW5MaXRlLmRlZmF1bHRTdHJpbmdGaWx0ZXIgPSBDU1NQbHVnaW4uY29sb3JTdHJpbmdGaWx0ZXI7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogQHByaXZhdGUgUmV0dXJucyBhIGZvcm1hdHRlciBmdW5jdGlvbiB0aGF0IGhhbmRsZXMgdGFraW5nIGEgc3RyaW5nIChvciBudW1iZXIgaW4gc29tZSBjYXNlcykgYW5kIHJldHVybmluZyBhIGNvbnNpc3RlbnRseSBmb3JtYXR0ZWQgb25lIGluIHRlcm1zIG9mIGRlbGltaXRlcnMsIHF1YW50aXR5IG9mIHZhbHVlcywgZXRjLiBGb3IgZXhhbXBsZSwgd2UgbWF5IGdldCBib3hTaGFkb3cgdmFsdWVzIGRlZmluZWQgYXMgXCIwcHggcmVkXCIgb3IgXCIwcHggMHB4IDEwcHggcmdiKDI1NSwwLDApXCIgb3IgXCIwcHggMHB4IDIwcHggMjBweCAjRjAwXCIgYW5kIHdlIG5lZWQgdG8gZW5zdXJlIHRoYXQgd2hhdCB3ZSBnZXQgYmFjayBpcyBkZXNjcmliZWQgd2l0aCA0IG51bWJlcnMgYW5kIGEgY29sb3IuIFRoaXMgYWxsb3dzIHVzIHRvIGZlZWQgaXQgaW50byB0aGUgX3BhcnNlQ29tcGxleCgpIG1ldGhvZCBhbmQgc3BsaXQgdGhlIHZhbHVlcyB1cCBhcHByb3ByaWF0ZWx5LiBUaGUgbmVhdCB0aGluZyBhYm91dCB0aGlzIF9nZXRGb3JtYXR0ZXIoKSBmdW5jdGlvbiBpcyB0aGF0IHRoZSBkZmx0IGRlZmluZXMgYSBwYXR0ZXJuIGFzIHdlbGwgYXMgYSBkZWZhdWx0LCBzbyBmb3IgZXhhbXBsZSwgX2dldEZvcm1hdHRlcihcIjBweCAwcHggMHB4IDBweCAjNzc3XCIsIHRydWUpIG5vdCBvbmx5IHNldHMgdGhlIGRlZmF1bHQgYXMgMHB4IGZvciBhbGwgZGlzdGFuY2VzIGFuZCAjNzc3IGZvciB0aGUgY29sb3IsIGJ1dCBhbHNvIHNldHMgdGhlIHBhdHRlcm4gc3VjaCB0aGF0IDQgbnVtYmVycyBhbmQgYSBjb2xvciB3aWxsIGFsd2F5cyBnZXQgcmV0dXJuZWQuXG5cdFx0ICogQHBhcmFtIHshc3RyaW5nfSBkZmx0IFRoZSBkZWZhdWx0IHZhbHVlIGFuZCBwYXR0ZXJuIHRvIGZvbGxvdy4gU28gXCIwcHggMHB4IDBweCAwcHggIzc3N1wiIHdpbGwgZW5zdXJlIHRoYXQgNCBudW1iZXJzIGFuZCBhIGNvbG9yIHdpbGwgYWx3YXlzIGdldCByZXR1cm5lZC5cblx0XHQgKiBAcGFyYW0ge2Jvb2xlYW49fSBjbHIgSWYgdHJ1ZSwgdGhlIHZhbHVlcyBzaG91bGQgYmUgc2VhcmNoZWQgZm9yIGNvbG9yLXJlbGF0ZWQgZGF0YS4gRm9yIGV4YW1wbGUsIGJveFNoYWRvdyB2YWx1ZXMgdHlwaWNhbGx5IGNvbnRhaW4gYSBjb2xvciB3aGVyZWFzIGJvcmRlclJhZGl1cyBkb24ndC5cblx0XHQgKiBAcGFyYW0ge2Jvb2xlYW49fSBjb2xsYXBzaWJsZSBJZiB0cnVlLCB0aGUgdmFsdWUgaXMgYSB0b3AvbGVmdC9yaWdodC9ib3R0b20gc3R5bGUgb25lIHRoYXQgYWN0cyBsaWtlIG1hcmdpbiBvciBwYWRkaW5nLCB3aGVyZSBpZiBvbmx5IG9uZSB2YWx1ZSBpcyByZWNlaXZlZCwgaXQncyB1c2VkIGZvciBhbGwgNDsgaWYgMiBhcmUgcmVjZWl2ZWQsIHRoZSBmaXJzdCBpcyBkdXBsaWNhdGVkIGZvciAzcmQgKGJvdHRvbSkgYW5kIHRoZSAybmQgaXMgZHVwbGljYXRlZCBmb3IgdGhlIDR0aCBzcG90IChsZWZ0KSwgZXRjLlxuXHRcdCAqIEByZXR1cm4ge0Z1bmN0aW9ufSBmb3JtYXR0ZXIgZnVuY3Rpb25cblx0XHQgKi9cblx0XHR2YXIgX2dldEZvcm1hdHRlciA9IGZ1bmN0aW9uKGRmbHQsIGNsciwgY29sbGFwc2libGUsIG11bHRpKSB7XG5cdFx0XHRcdGlmIChkZmx0ID09IG51bGwpIHtcblx0XHRcdFx0XHRyZXR1cm4gZnVuY3Rpb24odikge3JldHVybiB2O307XG5cdFx0XHRcdH1cblx0XHRcdFx0dmFyIGRDb2xvciA9IGNsciA/IChkZmx0Lm1hdGNoKF9jb2xvckV4cCkgfHwgW1wiXCJdKVswXSA6IFwiXCIsXG5cdFx0XHRcdFx0ZFZhbHMgPSBkZmx0LnNwbGl0KGRDb2xvcikuam9pbihcIlwiKS5tYXRjaChfdmFsdWVzRXhwKSB8fCBbXSxcblx0XHRcdFx0XHRwZnggPSBkZmx0LnN1YnN0cigwLCBkZmx0LmluZGV4T2YoZFZhbHNbMF0pKSxcblx0XHRcdFx0XHRzZnggPSAoZGZsdC5jaGFyQXQoZGZsdC5sZW5ndGggLSAxKSA9PT0gXCIpXCIpID8gXCIpXCIgOiBcIlwiLFxuXHRcdFx0XHRcdGRlbGltID0gKGRmbHQuaW5kZXhPZihcIiBcIikgIT09IC0xKSA/IFwiIFwiIDogXCIsXCIsXG5cdFx0XHRcdFx0bnVtVmFscyA9IGRWYWxzLmxlbmd0aCxcblx0XHRcdFx0XHRkU2Z4ID0gKG51bVZhbHMgPiAwKSA/IGRWYWxzWzBdLnJlcGxhY2UoX251bUV4cCwgXCJcIikgOiBcIlwiLFxuXHRcdFx0XHRcdGZvcm1hdHRlcjtcblx0XHRcdFx0aWYgKCFudW1WYWxzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZ1bmN0aW9uKHYpIHtyZXR1cm4gdjt9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjbHIpIHtcblx0XHRcdFx0XHRmb3JtYXR0ZXIgPSBmdW5jdGlvbih2KSB7XG5cdFx0XHRcdFx0XHR2YXIgY29sb3IsIHZhbHMsIGksIGE7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mKHYpID09PSBcIm51bWJlclwiKSB7XG5cdFx0XHRcdFx0XHRcdHYgKz0gZFNmeDtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAobXVsdGkgJiYgX2NvbW1hc091dHNpZGVQYXJlbkV4cC50ZXN0KHYpKSB7XG5cdFx0XHRcdFx0XHRcdGEgPSB2LnJlcGxhY2UoX2NvbW1hc091dHNpZGVQYXJlbkV4cCwgXCJ8XCIpLnNwbGl0KFwifFwiKTtcblx0XHRcdFx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRhW2ldID0gZm9ybWF0dGVyKGFbaV0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhLmpvaW4oXCIsXCIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29sb3IgPSAodi5tYXRjaChfY29sb3JFeHApIHx8IFtkQ29sb3JdKVswXTtcblx0XHRcdFx0XHRcdHZhbHMgPSB2LnNwbGl0KGNvbG9yKS5qb2luKFwiXCIpLm1hdGNoKF92YWx1ZXNFeHApIHx8IFtdO1xuXHRcdFx0XHRcdFx0aSA9IHZhbHMubGVuZ3RoO1xuXHRcdFx0XHRcdFx0aWYgKG51bVZhbHMgPiBpLS0pIHtcblx0XHRcdFx0XHRcdFx0d2hpbGUgKCsraSA8IG51bVZhbHMpIHtcblx0XHRcdFx0XHRcdFx0XHR2YWxzW2ldID0gY29sbGFwc2libGUgPyB2YWxzWygoKGkgLSAxKSAvIDIpIHwgMCldIDogZFZhbHNbaV07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBwZnggKyB2YWxzLmpvaW4oZGVsaW0pICsgZGVsaW0gKyBjb2xvciArIHNmeCArICh2LmluZGV4T2YoXCJpbnNldFwiKSAhPT0gLTEgPyBcIiBpbnNldFwiIDogXCJcIik7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXR1cm4gZm9ybWF0dGVyO1xuXG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9ybWF0dGVyID0gZnVuY3Rpb24odikge1xuXHRcdFx0XHRcdHZhciB2YWxzLCBhLCBpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YodikgPT09IFwibnVtYmVyXCIpIHtcblx0XHRcdFx0XHRcdHYgKz0gZFNmeDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKG11bHRpICYmIF9jb21tYXNPdXRzaWRlUGFyZW5FeHAudGVzdCh2KSkge1xuXHRcdFx0XHRcdFx0YSA9IHYucmVwbGFjZShfY29tbWFzT3V0c2lkZVBhcmVuRXhwLCBcInxcIikuc3BsaXQoXCJ8XCIpO1xuXHRcdFx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0YVtpXSA9IGZvcm1hdHRlcihhW2ldKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBhLmpvaW4oXCIsXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR2YWxzID0gdi5tYXRjaChfdmFsdWVzRXhwKSB8fCBbXTtcblx0XHRcdFx0XHRpID0gdmFscy5sZW5ndGg7XG5cdFx0XHRcdFx0aWYgKG51bVZhbHMgPiBpLS0pIHtcblx0XHRcdFx0XHRcdHdoaWxlICgrK2kgPCBudW1WYWxzKSB7XG5cdFx0XHRcdFx0XHRcdHZhbHNbaV0gPSBjb2xsYXBzaWJsZSA/IHZhbHNbKCgoaSAtIDEpIC8gMikgfCAwKV0gOiBkVmFsc1tpXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHBmeCArIHZhbHMuam9pbihkZWxpbSkgKyBzZng7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHJldHVybiBmb3JtYXR0ZXI7XG5cdFx0XHR9LFxuXG5cdFx0XHQvKipcblx0XHRcdCAqIEBwcml2YXRlIHJldHVybnMgYSBmb3JtYXR0ZXIgZnVuY3Rpb24gdGhhdCdzIHVzZWQgZm9yIGVkZ2UtcmVsYXRlZCB2YWx1ZXMgbGlrZSBtYXJnaW5Ub3AsIG1hcmdpbkxlZnQsIHBhZGRpbmdCb3R0b20sIHBhZGRpbmdSaWdodCwgZXRjLiBKdXN0IHBhc3MgYSBjb21tYS1kZWxpbWl0ZWQgbGlzdCBvZiBwcm9wZXJ0eSBuYW1lcyByZWxhdGVkIHRvIHRoZSBlZGdlcy5cblx0XHRcdCAqIEBwYXJhbSB7IXN0cmluZ30gcHJvcHMgYSBjb21tYS1kZWxpbWl0ZWQgbGlzdCBvZiBwcm9wZXJ0eSBuYW1lcyBpbiBvcmRlciBmcm9tIHRvcCB0byBsZWZ0LCBsaWtlIFwibWFyZ2luVG9wLG1hcmdpblJpZ2h0LG1hcmdpbkJvdHRvbSxtYXJnaW5MZWZ0XCJcblx0XHRcdCAqIEByZXR1cm4ge0Z1bmN0aW9ufSBhIGZvcm1hdHRlciBmdW5jdGlvblxuXHRcdFx0ICovXG5cdFx0XHRfZ2V0RWRnZVBhcnNlciA9IGZ1bmN0aW9uKHByb3BzKSB7XG5cdFx0XHRcdHByb3BzID0gcHJvcHMuc3BsaXQoXCIsXCIpO1xuXHRcdFx0XHRyZXR1cm4gZnVuY3Rpb24odCwgZSwgcCwgY3NzcCwgcHQsIHBsdWdpbiwgdmFycykge1xuXHRcdFx0XHRcdHZhciBhID0gKGUgKyBcIlwiKS5zcGxpdChcIiBcIiksXG5cdFx0XHRcdFx0XHRpO1xuXHRcdFx0XHRcdHZhcnMgPSB7fTtcblx0XHRcdFx0XHRmb3IgKGkgPSAwOyBpIDwgNDsgaSsrKSB7XG5cdFx0XHRcdFx0XHR2YXJzW3Byb3BzW2ldXSA9IGFbaV0gPSBhW2ldIHx8IGFbKCgoaSAtIDEpIC8gMikgPj4gMCldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gY3NzcC5wYXJzZSh0LCB2YXJzLCBwdCwgcGx1Z2luKTtcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cblx0XHRcdC8vIEBwcml2YXRlIHVzZWQgd2hlbiBvdGhlciBwbHVnaW5zIG11c3QgdHdlZW4gdmFsdWVzIGZpcnN0LCBsaWtlIEJlemllclBsdWdpbiBvciBUaHJvd1Byb3BzUGx1Z2luLCBldGMuIFRoYXQgcGx1Z2luJ3Mgc2V0UmF0aW8oKSBnZXRzIGNhbGxlZCBmaXJzdCBzbyB0aGF0IHRoZSB2YWx1ZXMgYXJlIHVwZGF0ZWQsIGFuZCB0aGVuIHdlIGxvb3AgdGhyb3VnaCB0aGUgTWluaVByb3BUd2VlbnMgIHdoaWNoIGhhbmRsZSBjb3B5aW5nIHRoZSB2YWx1ZXMgaW50byB0aGVpciBhcHByb3ByaWF0ZSBzbG90cyBzbyB0aGF0IHRoZXkgY2FuIHRoZW4gYmUgYXBwbGllZCBjb3JyZWN0bHkgaW4gdGhlIG1haW4gQ1NTUGx1Z2luIHNldFJhdGlvKCkgbWV0aG9kLiBSZW1lbWJlciwgd2UgdHlwaWNhbGx5IGNyZWF0ZSBhIHByb3h5IG9iamVjdCB0aGF0IGhhcyBhIGJ1bmNoIG9mIHVuaXF1ZWx5LW5hbWVkIHByb3BlcnRpZXMgdGhhdCB3ZSBmZWVkIHRvIHRoZSBzdWItcGx1Z2luIGFuZCBpdCBkb2VzIGl0cyBtYWdpYyBub3JtYWxseSwgYW5kIHRoZW4gd2UgbXVzdCBpbnRlcnByZXQgdGhvc2UgdmFsdWVzIGFuZCBhcHBseSB0aGVtIHRvIHRoZSBjc3MgYmVjYXVzZSBvZnRlbiBudW1iZXJzIG11c3QgZ2V0IGNvbWJpbmVkL2NvbmNhdGVuYXRlZCwgc3VmZml4ZXMgYWRkZWQsIGV0Yy4gdG8gd29yayB3aXRoIGNzcywgbGlrZSBib3hTaGFkb3cgY291bGQgaGF2ZSA0IHZhbHVlcyBwbHVzIGEgY29sb3IuXG5cdFx0XHRfc2V0UGx1Z2luUmF0aW8gPSBfaW50ZXJuYWxzLl9zZXRQbHVnaW5SYXRpbyA9IGZ1bmN0aW9uKHYpIHtcblx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0UmF0aW8odik7XG5cdFx0XHRcdHZhciBkID0gdGhpcy5kYXRhLFxuXHRcdFx0XHRcdHByb3h5ID0gZC5wcm94eSxcblx0XHRcdFx0XHRtcHQgPSBkLmZpcnN0TVBULFxuXHRcdFx0XHRcdG1pbiA9IDAuMDAwMDAxLFxuXHRcdFx0XHRcdHZhbCwgcHQsIGksIHN0cjtcblx0XHRcdFx0d2hpbGUgKG1wdCkge1xuXHRcdFx0XHRcdHZhbCA9IHByb3h5W21wdC52XTtcblx0XHRcdFx0XHRpZiAobXB0LnIpIHtcblx0XHRcdFx0XHRcdHZhbCA9IE1hdGgucm91bmQodmFsKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHZhbCA8IG1pbiAmJiB2YWwgPiAtbWluKSB7XG5cdFx0XHRcdFx0XHR2YWwgPSAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtcHQudFttcHQucF0gPSB2YWw7XG5cdFx0XHRcdFx0bXB0ID0gbXB0Ll9uZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkLmF1dG9Sb3RhdGUpIHtcblx0XHRcdFx0XHRkLmF1dG9Sb3RhdGUucm90YXRpb24gPSBwcm94eS5yb3RhdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvL2F0IHRoZSBlbmQsIHdlIG11c3Qgc2V0IHRoZSBDU1NQcm9wVHdlZW4ncyBcImVcIiAoZW5kKSB2YWx1ZSBkeW5hbWljYWxseSBoZXJlIGJlY2F1c2UgdGhhdCdzIHdoYXQgaXMgdXNlZCBpbiB0aGUgZmluYWwgc2V0UmF0aW8oKSBtZXRob2QuXG5cdFx0XHRcdGlmICh2ID09PSAxKSB7XG5cdFx0XHRcdFx0bXB0ID0gZC5maXJzdE1QVDtcblx0XHRcdFx0XHR3aGlsZSAobXB0KSB7XG5cdFx0XHRcdFx0XHRwdCA9IG1wdC50O1xuXHRcdFx0XHRcdFx0aWYgKCFwdC50eXBlKSB7XG5cdFx0XHRcdFx0XHRcdHB0LmUgPSBwdC5zICsgcHQueHMwO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChwdC50eXBlID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdHN0ciA9IHB0LnhzMCArIHB0LnMgKyBwdC54czE7XG5cdFx0XHRcdFx0XHRcdGZvciAoaSA9IDE7IGkgPCBwdC5sOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRzdHIgKz0gcHRbXCJ4blwiK2ldICsgcHRbXCJ4c1wiKyhpKzEpXTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRwdC5lID0gc3RyO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bXB0ID0gbXB0Ll9uZXh0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblxuXHRcdFx0LyoqXG5cdFx0XHQgKiBAcHJpdmF0ZSBAY29uc3RydWN0b3IgVXNlZCBieSBhIGZldyBTcGVjaWFsUHJvcHMgdG8gaG9sZCBpbXBvcnRhbnQgdmFsdWVzIGZvciBwcm94aWVzLiBGb3IgZXhhbXBsZSwgX3BhcnNlVG9Qcm94eSgpIGNyZWF0ZXMgYSBNaW5pUHJvcFR3ZWVuIGluc3RhbmNlIGZvciBlYWNoIHByb3BlcnR5IHRoYXQgbXVzdCBnZXQgdHdlZW5lZCBvbiB0aGUgcHJveHksIGFuZCB3ZSByZWNvcmQgdGhlIG9yaWdpbmFsIHByb3BlcnR5IG5hbWUgYXMgd2VsbCBhcyB0aGUgdW5pcXVlIG9uZSB3ZSBjcmVhdGUgZm9yIHRoZSBwcm94eSwgcGx1cyB3aGV0aGVyIG9yIG5vdCB0aGUgdmFsdWUgbmVlZHMgdG8gYmUgcm91bmRlZCBwbHVzIHRoZSBvcmlnaW5hbCB2YWx1ZS5cblx0XHRcdCAqIEBwYXJhbSB7IU9iamVjdH0gdCB0YXJnZXQgb2JqZWN0IHdob3NlIHByb3BlcnR5IHdlJ3JlIHR3ZWVuaW5nIChvZnRlbiBhIENTU1Byb3BUd2Vlbilcblx0XHRcdCAqIEBwYXJhbSB7IXN0cmluZ30gcCBwcm9wZXJ0eSBuYW1lXG5cdFx0XHQgKiBAcGFyYW0geyhudW1iZXJ8c3RyaW5nfG9iamVjdCl9IHYgdmFsdWVcblx0XHRcdCAqIEBwYXJhbSB7TWluaVByb3BUd2Vlbj19IG5leHQgbmV4dCBNaW5pUHJvcFR3ZWVuIGluIHRoZSBsaW5rZWQgbGlzdFxuXHRcdFx0ICogQHBhcmFtIHtib29sZWFuPX0gciBpZiB0cnVlLCB0aGUgdHdlZW5lZCB2YWx1ZSBzaG91bGQgYmUgcm91bmRlZCB0byB0aGUgbmVhcmVzdCBpbnRlZ2VyXG5cdFx0XHQgKi9cblx0XHRcdE1pbmlQcm9wVHdlZW4gPSBmdW5jdGlvbih0LCBwLCB2LCBuZXh0LCByKSB7XG5cdFx0XHRcdHRoaXMudCA9IHQ7XG5cdFx0XHRcdHRoaXMucCA9IHA7XG5cdFx0XHRcdHRoaXMudiA9IHY7XG5cdFx0XHRcdHRoaXMuciA9IHI7XG5cdFx0XHRcdGlmIChuZXh0KSB7XG5cdFx0XHRcdFx0bmV4dC5fcHJldiA9IHRoaXM7XG5cdFx0XHRcdFx0dGhpcy5fbmV4dCA9IG5leHQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdC8qKlxuXHRcdFx0ICogQHByaXZhdGUgTW9zdCBvdGhlciBwbHVnaW5zIChsaWtlIEJlemllclBsdWdpbiBhbmQgVGhyb3dQcm9wc1BsdWdpbiBhbmQgb3RoZXJzKSBjYW4gb25seSB0d2VlbiBudW1lcmljIHZhbHVlcywgYnV0IENTU1BsdWdpbiBtdXN0IGFjY29tbW9kYXRlIHNwZWNpYWwgdmFsdWVzIHRoYXQgaGF2ZSBhIGJ1bmNoIG9mIGV4dHJhIGRhdGEgKGxpa2UgYSBzdWZmaXggb3Igc3RyaW5ncyBiZXR3ZWVuIG51bWVyaWMgdmFsdWVzLCBldGMuKS4gRm9yIGV4YW1wbGUsIGJveFNoYWRvdyBoYXMgdmFsdWVzIGxpa2UgXCIxMHB4IDEwcHggMjBweCAzMHB4IHJnYigyNTUsMCwwKVwiIHdoaWNoIHdvdWxkIHV0dGVybHkgY29uZnVzZSBvdGhlciBwbHVnaW5zLiBUaGlzIG1ldGhvZCBhbGxvd3MgdXMgdG8gc3BsaXQgdGhhdCBkYXRhIGFwYXJ0IGFuZCBncmFiIG9ubHkgdGhlIG51bWVyaWMgZGF0YSBhbmQgYXR0YWNoIGl0IHRvIHVuaXF1ZWx5LW5hbWVkIHByb3BlcnRpZXMgb2YgYSBnZW5lcmljIHByb3h5IG9iamVjdCAoe30pIHNvIHRoYXQgd2UgY2FuIGZlZWQgdGhhdCB0byB2aXJ0dWFsbHkgYW55IHBsdWdpbiB0byBoYXZlIHRoZSBudW1iZXJzIHR3ZWVuZWQuIEhvd2V2ZXIsIHdlIG11c3QgYWxzbyBrZWVwIHRyYWNrIG9mIHdoaWNoIHByb3BlcnRpZXMgZnJvbSB0aGUgcHJveHkgZ28gd2l0aCB3aGljaCBDU1NQcm9wVHdlZW4gdmFsdWVzIGFuZCBpbnN0YW5jZXMuIFNvIHdlIGNyZWF0ZSBhIGxpbmtlZCBsaXN0IG9mIE1pbmlQcm9wVHdlZW5zLiBFYWNoIG9uZSByZWNvcmRzIGEgdGFyZ2V0ICh0aGUgb3JpZ2luYWwgQ1NTUHJvcFR3ZWVuKSwgcHJvcGVydHkgKGxpa2UgXCJzXCIgb3IgXCJ4bjFcIiBvciBcInhuMlwiKSB0aGF0IHdlJ3JlIHR3ZWVuaW5nIGFuZCB0aGUgdW5pcXVlIHByb3BlcnR5IG5hbWUgdGhhdCB3YXMgdXNlZCBmb3IgdGhlIHByb3h5IChsaWtlIFwiYm94U2hhZG93X3huMVwiIGFuZCBcImJveFNoYWRvd194bjJcIikgYW5kIHdoZXRoZXIgb3Igbm90IHRoZXkgbmVlZCB0byBiZSByb3VuZGVkLiBUaGF0IHdheSwgaW4gdGhlIF9zZXRQbHVnaW5SYXRpbygpIG1ldGhvZCB3ZSBjYW4gc2ltcGx5IGNvcHkgdGhlIHZhbHVlcyBvdmVyIGZyb20gdGhlIHByb3h5IHRvIHRoZSBDU1NQcm9wVHdlZW4gaW5zdGFuY2UocykuIFRoZW4sIHdoZW4gdGhlIG1haW4gQ1NTUGx1Z2luIHNldFJhdGlvKCkgbWV0aG9kIHJ1bnMgYW5kIGFwcGxpZXMgdGhlIENTU1Byb3BUd2VlbiB2YWx1ZXMgYWNjb3JkaW5nbHksIHRoZXkncmUgdXBkYXRlZCBuaWNlbHkuIFNvIHRoZSBleHRlcm5hbCBwbHVnaW4gdHdlZW5zIHRoZSBudW1iZXJzLCBfc2V0UGx1Z2luUmF0aW8oKSBjb3BpZXMgdGhlbSBvdmVyLCBhbmQgc2V0UmF0aW8oKSBhY3RzIG5vcm1hbGx5LCBhcHBseWluZyBjc3Mtc3BlY2lmaWMgdmFsdWVzIHRvIHRoZSBlbGVtZW50LlxuXHRcdFx0ICogVGhpcyBtZXRob2QgcmV0dXJucyBhbiBvYmplY3QgdGhhdCBoYXMgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuXHRcdFx0ICogIC0gcHJveHk6IGEgZ2VuZXJpYyBvYmplY3QgY29udGFpbmluZyB0aGUgc3RhcnRpbmcgdmFsdWVzIGZvciBhbGwgdGhlIHByb3BlcnRpZXMgdGhhdCB3aWxsIGJlIHR3ZWVuZWQgYnkgdGhlIGV4dGVybmFsIHBsdWdpbi4gIFRoaXMgaXMgd2hhdCB3ZSBmZWVkIHRvIHRoZSBleHRlcm5hbCBfb25Jbml0VHdlZW4oKSBhcyB0aGUgdGFyZ2V0XG5cdFx0XHQgKiAgLSBlbmQ6IGEgZ2VuZXJpYyBvYmplY3QgY29udGFpbmluZyB0aGUgZW5kaW5nIHZhbHVlcyBmb3IgYWxsIHRoZSBwcm9wZXJ0aWVzIHRoYXQgd2lsbCBiZSB0d2VlbmVkIGJ5IHRoZSBleHRlcm5hbCBwbHVnaW4uIFRoaXMgaXMgd2hhdCB3ZSBmZWVkIHRvIHRoZSBleHRlcm5hbCBwbHVnaW4ncyBfb25Jbml0VHdlZW4oKSBhcyB0aGUgZGVzdGluYXRpb24gdmFsdWVzXG5cdFx0XHQgKiAgLSBmaXJzdE1QVDogdGhlIGZpcnN0IE1pbmlQcm9wVHdlZW4gaW4gdGhlIGxpbmtlZCBsaXN0XG5cdFx0XHQgKiAgLSBwdDogdGhlIGZpcnN0IENTU1Byb3BUd2VlbiBpbiB0aGUgbGlua2VkIGxpc3QgdGhhdCB3YXMgY3JlYXRlZCB3aGVuIHBhcnNpbmcuIElmIHNoYWxsb3cgaXMgdHJ1ZSwgdGhpcyBsaW5rZWQgbGlzdCB3aWxsIE5PVCBhdHRhY2ggdG8gdGhlIG9uZSBwYXNzZWQgaW50byB0aGUgX3BhcnNlVG9Qcm94eSgpIGFzIHRoZSBcInB0XCIgKDR0aCkgcGFyYW1ldGVyLlxuXHRcdFx0ICogQHBhcmFtIHshT2JqZWN0fSB0IHRhcmdldCBvYmplY3QgdG8gYmUgdHdlZW5lZFxuXHRcdFx0ICogQHBhcmFtIHshKE9iamVjdHxzdHJpbmcpfSB2YXJzIHRoZSBvYmplY3QgY29udGFpbmluZyB0aGUgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHR3ZWVuaW5nIHZhbHVlcyAodHlwaWNhbGx5IHRoZSBlbmQvZGVzdGluYXRpb24gdmFsdWVzKSB0aGF0IHNob3VsZCBiZSBwYXJzZWRcblx0XHRcdCAqIEBwYXJhbSB7IUNTU1BsdWdpbn0gY3NzcCBUaGUgQ1NTUGx1Z2luIGluc3RhbmNlXG5cdFx0XHQgKiBAcGFyYW0ge0NTU1Byb3BUd2Vlbj19IHB0IHRoZSBuZXh0IENTU1Byb3BUd2VlbiBpbiB0aGUgbGlua2VkIGxpc3Rcblx0XHRcdCAqIEBwYXJhbSB7VHdlZW5QbHVnaW49fSBwbHVnaW4gdGhlIGV4dGVybmFsIFR3ZWVuUGx1Z2luIGluc3RhbmNlIHRoYXQgd2lsbCBiZSBoYW5kbGluZyB0d2VlbmluZyB0aGUgbnVtZXJpYyB2YWx1ZXNcblx0XHRcdCAqIEBwYXJhbSB7Ym9vbGVhbj19IHNoYWxsb3cgaWYgdHJ1ZSwgdGhlIHJlc3VsdGluZyBsaW5rZWQgbGlzdCBmcm9tIHRoZSBwYXJzZSB3aWxsIE5PVCBiZSBhdHRhY2hlZCB0byB0aGUgQ1NTUHJvcFR3ZWVuIHRoYXQgd2FzIHBhc3NlZCBpbiBhcyB0aGUgXCJwdFwiICg0dGgpIHBhcmFtZXRlci5cblx0XHRcdCAqIEByZXR1cm4gQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOiBwcm94eSwgZW5kLCBmaXJzdE1QVCwgYW5kIHB0IChzZWUgYWJvdmUgZm9yIGRlc2NyaXB0aW9ucylcblx0XHRcdCAqL1xuXHRcdFx0X3BhcnNlVG9Qcm94eSA9IF9pbnRlcm5hbHMuX3BhcnNlVG9Qcm94eSA9IGZ1bmN0aW9uKHQsIHZhcnMsIGNzc3AsIHB0LCBwbHVnaW4sIHNoYWxsb3cpIHtcblx0XHRcdFx0dmFyIGJwdCA9IHB0LFxuXHRcdFx0XHRcdHN0YXJ0ID0ge30sXG5cdFx0XHRcdFx0ZW5kID0ge30sXG5cdFx0XHRcdFx0dHJhbnNmb3JtID0gY3NzcC5fdHJhbnNmb3JtLFxuXHRcdFx0XHRcdG9sZEZvcmNlID0gX2ZvcmNlUFQsXG5cdFx0XHRcdFx0aSwgcCwgeHAsIG1wdCwgZmlyc3RQVDtcblx0XHRcdFx0Y3NzcC5fdHJhbnNmb3JtID0gbnVsbDtcblx0XHRcdFx0X2ZvcmNlUFQgPSB2YXJzO1xuXHRcdFx0XHRwdCA9IGZpcnN0UFQgPSBjc3NwLnBhcnNlKHQsIHZhcnMsIHB0LCBwbHVnaW4pO1xuXHRcdFx0XHRfZm9yY2VQVCA9IG9sZEZvcmNlO1xuXHRcdFx0XHQvL2JyZWFrIG9mZiBmcm9tIHRoZSBsaW5rZWQgbGlzdCBzbyB0aGUgbmV3IG9uZXMgYXJlIGlzb2xhdGVkLlxuXHRcdFx0XHRpZiAoc2hhbGxvdykge1xuXHRcdFx0XHRcdGNzc3AuX3RyYW5zZm9ybSA9IHRyYW5zZm9ybTtcblx0XHRcdFx0XHRpZiAoYnB0KSB7XG5cdFx0XHRcdFx0XHRicHQuX3ByZXYgPSBudWxsO1xuXHRcdFx0XHRcdFx0aWYgKGJwdC5fcHJldikge1xuXHRcdFx0XHRcdFx0XHRicHQuX3ByZXYuX25leHQgPSBudWxsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR3aGlsZSAocHQgJiYgcHQgIT09IGJwdCkge1xuXHRcdFx0XHRcdGlmIChwdC50eXBlIDw9IDEpIHtcblx0XHRcdFx0XHRcdHAgPSBwdC5wO1xuXHRcdFx0XHRcdFx0ZW5kW3BdID0gcHQucyArIHB0LmM7XG5cdFx0XHRcdFx0XHRzdGFydFtwXSA9IHB0LnM7XG5cdFx0XHRcdFx0XHRpZiAoIXNoYWxsb3cpIHtcblx0XHRcdFx0XHRcdFx0bXB0ID0gbmV3IE1pbmlQcm9wVHdlZW4ocHQsIFwic1wiLCBwLCBtcHQsIHB0LnIpO1xuXHRcdFx0XHRcdFx0XHRwdC5jID0gMDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChwdC50eXBlID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdGkgPSBwdC5sO1xuXHRcdFx0XHRcdFx0XHR3aGlsZSAoLS1pID4gMCkge1xuXHRcdFx0XHRcdFx0XHRcdHhwID0gXCJ4blwiICsgaTtcblx0XHRcdFx0XHRcdFx0XHRwID0gcHQucCArIFwiX1wiICsgeHA7XG5cdFx0XHRcdFx0XHRcdFx0ZW5kW3BdID0gcHQuZGF0YVt4cF07XG5cdFx0XHRcdFx0XHRcdFx0c3RhcnRbcF0gPSBwdFt4cF07XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFzaGFsbG93KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRtcHQgPSBuZXcgTWluaVByb3BUd2VlbihwdCwgeHAsIHAsIG1wdCwgcHQucnhwW3hwXSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHB0ID0gcHQuX25leHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtwcm94eTpzdGFydCwgZW5kOmVuZCwgZmlyc3RNUFQ6bXB0LCBwdDpmaXJzdFBUfTtcblx0XHRcdH0sXG5cblxuXG5cdFx0XHQvKipcblx0XHRcdCAqIEBjb25zdHJ1Y3RvciBFYWNoIHByb3BlcnR5IHRoYXQgaXMgdHdlZW5lZCBoYXMgYXQgbGVhc3Qgb25lIENTU1Byb3BUd2VlbiBhc3NvY2lhdGVkIHdpdGggaXQuIFRoZXNlIGluc3RhbmNlcyBzdG9yZSBpbXBvcnRhbnQgaW5mb3JtYXRpb24gbGlrZSB0aGUgdGFyZ2V0LCBwcm9wZXJ0eSwgc3RhcnRpbmcgdmFsdWUsIGFtb3VudCBvZiBjaGFuZ2UsIGV0Yy4gVGhleSBjYW4gYWxzbyBvcHRpb25hbGx5IGhhdmUgYSBudW1iZXIgb2YgXCJleHRyYVwiIHN0cmluZ3MgYW5kIG51bWVyaWMgdmFsdWVzIG5hbWVkIHhzMSwgeG4xLCB4czIsIHhuMiwgeHMzLCB4bjMsIGV0Yy4gd2hlcmUgXCJzXCIgaW5kaWNhdGVzIHN0cmluZyBhbmQgXCJuXCIgaW5kaWNhdGVzIG51bWJlci4gVGhlc2UgY2FuIGJlIHBpZWNlZCB0b2dldGhlciBpbiBhIGNvbXBsZXgtdmFsdWUgdHdlZW4gKHR5cGU6MSkgdGhhdCBoYXMgYWx0ZXJuYXRpbmcgdHlwZXMgb2YgZGF0YSBsaWtlIGEgc3RyaW5nLCBudW1iZXIsIHN0cmluZywgbnVtYmVyLCBldGMuIEZvciBleGFtcGxlLCBib3hTaGFkb3cgY291bGQgYmUgXCI1cHggNXB4IDhweCByZ2IoMTAyLCAxMDIsIDUxKVwiLiBJbiB0aGF0IHZhbHVlLCB0aGVyZSBhcmUgNiBudW1iZXJzIHRoYXQgbWF5IG5lZWQgdG8gdHdlZW4gYW5kIHRoZW4gcGllY2VkIGJhY2sgdG9nZXRoZXIgaW50byBhIHN0cmluZyBhZ2FpbiB3aXRoIHNwYWNlcywgc3VmZml4ZXMsIGV0Yy4geHMwIGlzIHNwZWNpYWwgaW4gdGhhdCBpdCBzdG9yZXMgdGhlIHN1ZmZpeCBmb3Igc3RhbmRhcmQgKHR5cGU6MCkgdHdlZW5zLCAtT1ItIHRoZSBmaXJzdCBzdHJpbmcgKHByZWZpeCkgaW4gYSBjb21wbGV4LXZhbHVlICh0eXBlOjEpIENTU1Byb3BUd2VlbiAtT1ItIGl0IGNhbiBiZSB0aGUgbm9uLXR3ZWVuaW5nIHZhbHVlIGluIGEgdHlwZTotMSBDU1NQcm9wVHdlZW4uIFdlIGRvIHRoaXMgdG8gY29uc2VydmUgbWVtb3J5LlxuXHRcdFx0ICogQ1NTUHJvcFR3ZWVucyBoYXZlIHRoZSBmb2xsb3dpbmcgb3B0aW9uYWwgcHJvcGVydGllcyBhcyB3ZWxsIChub3QgZGVmaW5lZCB0aHJvdWdoIHRoZSBjb25zdHJ1Y3Rvcik6XG5cdFx0XHQgKiAgLSBsOiBMZW5ndGggaW4gdGVybXMgb2YgdGhlIG51bWJlciBvZiBleHRyYSBwcm9wZXJ0aWVzIHRoYXQgdGhlIENTU1Byb3BUd2VlbiBoYXMgKGRlZmF1bHQ6IDApLiBGb3IgZXhhbXBsZSwgZm9yIGEgYm94U2hhZG93IHdlIG1heSBuZWVkIHRvIHR3ZWVuIDUgbnVtYmVycyBpbiB3aGljaCBjYXNlIGwgd291bGQgYmUgNTsgS2VlcCBpbiBtaW5kIHRoYXQgdGhlIHN0YXJ0L2VuZCB2YWx1ZXMgZm9yIHRoZSBmaXJzdCBudW1iZXIgdGhhdCdzIHR3ZWVuZWQgYXJlIGFsd2F5cyBzdG9yZWQgaW4gdGhlIHMgYW5kIGMgcHJvcGVydGllcyB0byBjb25zZXJ2ZSBtZW1vcnkuIEFsbCBhZGRpdGlvbmFsIHZhbHVlcyB0aGVyZWFmdGVyIGFyZSBzdG9yZWQgaW4geG4xLCB4bjIsIGV0Yy5cblx0XHRcdCAqICAtIHhmaXJzdDogVGhlIGZpcnN0IGluc3RhbmNlIG9mIGFueSBzdWItQ1NTUHJvcFR3ZWVucyB0aGF0IGFyZSB0d2VlbmluZyBwcm9wZXJ0aWVzIG9mIHRoaXMgaW5zdGFuY2UuIEZvciBleGFtcGxlLCB3ZSBtYXkgc3BsaXQgdXAgYSBib3hTaGFkb3cgdHdlZW4gc28gdGhhdCB0aGVyZSdzIGEgbWFpbiBDU1NQcm9wVHdlZW4gb2YgdHlwZToxIHRoYXQgaGFzIHZhcmlvdXMgeHMqIGFuZCB4biogdmFsdWVzIGFzc29jaWF0ZWQgd2l0aCB0aGUgaC1zaGFkb3csIHYtc2hhZG93LCBibHVyLCBjb2xvciwgZXRjLiBUaGVuIHdlIHNwYXduIGEgQ1NTUHJvcFR3ZWVuIGZvciBlYWNoIG9mIHRob3NlIHRoYXQgaGFzIGEgaGlnaGVyIHByaW9yaXR5IGFuZCBydW5zIEJFRk9SRSB0aGUgbWFpbiBDU1NQcm9wVHdlZW4gc28gdGhhdCB0aGUgdmFsdWVzIGFyZSBhbGwgc2V0IGJ5IHRoZSB0aW1lIGl0IG5lZWRzIHRvIHJlLWFzc2VtYmxlIHRoZW0uIFRoZSB4Zmlyc3QgZ2l2ZXMgdXMgYW4gZWFzeSB3YXkgdG8gaWRlbnRpZnkgdGhlIGZpcnN0IG9uZSBpbiB0aGF0IGNoYWluIHdoaWNoIHR5cGljYWxseSBlbmRzIGF0IHRoZSBtYWluIG9uZSAoYmVjYXVzZSB0aGV5J3JlIGFsbCBwcmVwZW5kZSB0byB0aGUgbGlua2VkIGxpc3QpXG5cdFx0XHQgKiAgLSBwbHVnaW46IFRoZSBUd2VlblBsdWdpbiBpbnN0YW5jZSB0aGF0IHdpbGwgaGFuZGxlIHRoZSB0d2VlbmluZyBvZiBhbnkgY29tcGxleCB2YWx1ZXMuIEZvciBleGFtcGxlLCBzb21ldGltZXMgd2UgZG9uJ3Qgd2FudCB0byB1c2Ugbm9ybWFsIHN1YnR3ZWVucyAobGlrZSB4Zmlyc3QgcmVmZXJzIHRvKSB0byB0d2VlbiB0aGUgdmFsdWVzIC0gd2UgbWlnaHQgd2FudCBUaHJvd1Byb3BzUGx1Z2luIG9yIEJlemllclBsdWdpbiBzb21lIG90aGVyIHBsdWdpbiB0byBkbyB0aGUgYWN0dWFsIHR3ZWVuaW5nLCBzbyB3ZSBjcmVhdGUgYSBwbHVnaW4gaW5zdGFuY2UgYW5kIHN0b3JlIGEgcmVmZXJlbmNlIGhlcmUuIFdlIG5lZWQgdGhpcyByZWZlcmVuY2Ugc28gdGhhdCBpZiB3ZSBnZXQgYSByZXF1ZXN0IHRvIHJvdW5kIHZhbHVlcyBvciBkaXNhYmxlIGEgdHdlZW4sIHdlIGNhbiBwYXNzIGFsb25nIHRoYXQgcmVxdWVzdC5cblx0XHRcdCAqICAtIGRhdGE6IEFyYml0cmFyeSBkYXRhIHRoYXQgbmVlZHMgdG8gYmUgc3RvcmVkIHdpdGggdGhlIENTU1Byb3BUd2Vlbi4gVHlwaWNhbGx5IGlmIHdlJ3JlIGdvaW5nIHRvIGhhdmUgYSBwbHVnaW4gaGFuZGxlIHRoZSB0d2VlbmluZyBvZiBhIGNvbXBsZXgtdmFsdWUgdHdlZW4sIHdlIGNyZWF0ZSBhIGdlbmVyaWMgb2JqZWN0IHRoYXQgc3RvcmVzIHRoZSBFTkQgdmFsdWVzIHRoYXQgd2UncmUgdHdlZW5pbmcgdG8gYW5kIHRoZSBDU1NQcm9wVHdlZW4ncyB4czEsIHhzMiwgZXRjLiBoYXZlIHRoZSBzdGFydGluZyB2YWx1ZXMuIFdlIHN0b3JlIHRoYXQgb2JqZWN0IGFzIGRhdGEuIFRoYXQgd2F5LCB3ZSBjYW4gc2ltcGx5IHBhc3MgdGhhdCBvYmplY3QgdG8gdGhlIHBsdWdpbiBhbmQgdXNlIHRoZSBDU1NQcm9wVHdlZW4gYXMgdGhlIHRhcmdldC5cblx0XHRcdCAqICAtIHNldFJhdGlvOiBPbmx5IHVzZWQgZm9yIHR5cGU6MiB0d2VlbnMgdGhhdCByZXF1aXJlIGN1c3RvbSBmdW5jdGlvbmFsaXR5LiBJbiB0aGlzIGNhc2UsIHdlIGNhbGwgdGhlIENTU1Byb3BUd2VlbidzIHNldFJhdGlvKCkgbWV0aG9kIGFuZCBwYXNzIHRoZSByYXRpbyBlYWNoIHRpbWUgdGhlIHR3ZWVuIHVwZGF0ZXMuIFRoaXMgaXNuJ3QgcXVpdGUgYXMgZWZmaWNpZW50IGFzIGRvaW5nIHRoaW5ncyBkaXJlY3RseSBpbiB0aGUgQ1NTUGx1Z2luJ3Mgc2V0UmF0aW8oKSBtZXRob2QsIGJ1dCBpdCdzIHZlcnkgY29udmVuaWVudCBhbmQgZmxleGlibGUuXG5cdFx0XHQgKiBAcGFyYW0geyFPYmplY3R9IHQgVGFyZ2V0IG9iamVjdCB3aG9zZSBwcm9wZXJ0eSB3aWxsIGJlIHR3ZWVuZWQuIE9mdGVuIGEgRE9NIGVsZW1lbnQsIGJ1dCBub3QgYWx3YXlzLiBJdCBjb3VsZCBiZSBhbnl0aGluZy5cblx0XHRcdCAqIEBwYXJhbSB7c3RyaW5nfSBwIFByb3BlcnR5IHRvIHR3ZWVuIChuYW1lKS4gRm9yIGV4YW1wbGUsIHRvIHR3ZWVuIGVsZW1lbnQud2lkdGgsIHAgd291bGQgYmUgXCJ3aWR0aFwiLlxuXHRcdFx0ICogQHBhcmFtIHtudW1iZXJ9IHMgU3RhcnRpbmcgbnVtZXJpYyB2YWx1ZVxuXHRcdFx0ICogQHBhcmFtIHtudW1iZXJ9IGMgQ2hhbmdlIGluIG51bWVyaWMgdmFsdWUgb3ZlciB0aGUgY291cnNlIG9mIHRoZSBlbnRpcmUgdHdlZW4uIEZvciBleGFtcGxlLCBpZiBlbGVtZW50LndpZHRoIHN0YXJ0cyBhdCA1IGFuZCBzaG91bGQgZW5kIGF0IDEwMCwgYyB3b3VsZCBiZSA5NS5cblx0XHRcdCAqIEBwYXJhbSB7Q1NTUHJvcFR3ZWVuPX0gbmV4dCBUaGUgbmV4dCBDU1NQcm9wVHdlZW4gaW4gdGhlIGxpbmtlZCBsaXN0LiBJZiBvbmUgaXMgZGVmaW5lZCwgd2Ugd2lsbCBkZWZpbmUgaXRzIF9wcmV2IGFzIHRoZSBuZXcgaW5zdGFuY2UsIGFuZCB0aGUgbmV3IGluc3RhbmNlJ3MgX25leHQgd2lsbCBiZSBwb2ludGVkIGF0IGl0LlxuXHRcdFx0ICogQHBhcmFtIHtudW1iZXI9fSB0eXBlIFRoZSB0eXBlIG9mIENTU1Byb3BUd2VlbiB3aGVyZSAtMSA9IGEgbm9uLXR3ZWVuaW5nIHZhbHVlLCAwID0gYSBzdGFuZGFyZCBzaW1wbGUgdHdlZW4sIDEgPSBhIGNvbXBsZXggdmFsdWUgKGxpa2Ugb25lIHRoYXQgaGFzIG11bHRpcGxlIG51bWJlcnMgaW4gYSBjb21tYS0gb3Igc3BhY2UtZGVsaW1pdGVkIHN0cmluZyBsaWtlIGJvcmRlcjpcIjFweCBzb2xpZCByZWRcIiksIGFuZCAyID0gb25lIHRoYXQgdXNlcyBhIGN1c3RvbSBzZXRSYXRpbyBmdW5jdGlvbiB0aGF0IGRvZXMgYWxsIG9mIHRoZSB3b3JrIG9mIGFwcGx5aW5nIHRoZSB2YWx1ZXMgb24gZWFjaCB1cGRhdGUuXG5cdFx0XHQgKiBAcGFyYW0ge3N0cmluZz19IG4gTmFtZSBvZiB0aGUgcHJvcGVydHkgdGhhdCBzaG91bGQgYmUgdXNlZCBmb3Igb3ZlcndyaXRpbmcgcHVycG9zZXMgd2hpY2ggaXMgdHlwaWNhbGx5IHRoZSBzYW1lIGFzIHAgYnV0IG5vdCBhbHdheXMuIEZvciBleGFtcGxlLCB3ZSBtYXkgbmVlZCB0byBjcmVhdGUgYSBzdWJ0d2VlbiBmb3IgdGhlIDJuZCBwYXJ0IG9mIGEgXCJjbGlwOnJlY3QoLi4uKVwiIHR3ZWVuIGluIHdoaWNoIGNhc2UgXCJwXCIgbWlnaHQgYmUgeHMxIGJ1dCBcIm5cIiBpcyBzdGlsbCBcImNsaXBcIlxuXHRcdFx0ICogQHBhcmFtIHtib29sZWFuPX0gciBJZiB0cnVlLCB0aGUgdmFsdWUocykgc2hvdWxkIGJlIHJvdW5kZWRcblx0XHRcdCAqIEBwYXJhbSB7bnVtYmVyPX0gcHIgUHJpb3JpdHkgaW4gdGhlIGxpbmtlZCBsaXN0IG9yZGVyLiBIaWdoZXIgcHJpb3JpdHkgQ1NTUHJvcFR3ZWVucyB3aWxsIGJlIHVwZGF0ZWQgYmVmb3JlIGxvd2VyIHByaW9yaXR5IG9uZXMuIFRoZSBkZWZhdWx0IHByaW9yaXR5IGlzIDAuXG5cdFx0XHQgKiBAcGFyYW0ge3N0cmluZz19IGIgQmVnaW5uaW5nIHZhbHVlLiBXZSBzdG9yZSB0aGlzIHRvIGVuc3VyZSB0aGF0IGl0IGlzIEVYQUNUTFkgd2hhdCBpdCB3YXMgd2hlbiB0aGUgdHdlZW4gYmVnYW4gd2l0aG91dCBhbnkgcmlzayBvZiBpbnRlcnByZXRhdGlvbiBpc3N1ZXMuXG5cdFx0XHQgKiBAcGFyYW0ge3N0cmluZz19IGUgRW5kaW5nIHZhbHVlLiBXZSBzdG9yZSB0aGlzIHRvIGVuc3VyZSB0aGF0IGl0IGlzIEVYQUNUTFkgd2hhdCB0aGUgdXNlciBkZWZpbmVkIGF0IHRoZSBlbmQgb2YgdGhlIHR3ZWVuIHdpdGhvdXQgYW55IHJpc2sgb2YgaW50ZXJwcmV0YXRpb24gaXNzdWVzLlxuXHRcdFx0ICovXG5cdFx0XHRDU1NQcm9wVHdlZW4gPSBfaW50ZXJuYWxzLkNTU1Byb3BUd2VlbiA9IGZ1bmN0aW9uKHQsIHAsIHMsIGMsIG5leHQsIHR5cGUsIG4sIHIsIHByLCBiLCBlKSB7XG5cdFx0XHRcdHRoaXMudCA9IHQ7IC8vdGFyZ2V0XG5cdFx0XHRcdHRoaXMucCA9IHA7IC8vcHJvcGVydHlcblx0XHRcdFx0dGhpcy5zID0gczsgLy9zdGFydGluZyB2YWx1ZVxuXHRcdFx0XHR0aGlzLmMgPSBjOyAvL2NoYW5nZSB2YWx1ZVxuXHRcdFx0XHR0aGlzLm4gPSBuIHx8IHA7IC8vbmFtZSB0aGF0IHRoaXMgQ1NTUHJvcFR3ZWVuIHNob3VsZCBiZSBhc3NvY2lhdGVkIHRvICh1c3VhbGx5IHRoZSBzYW1lIGFzIHAsIGJ1dCBub3QgYWx3YXlzIC0gbiBpcyB3aGF0IG92ZXJ3cml0aW5nIGxvb2tzIGF0KVxuXHRcdFx0XHRpZiAoISh0IGluc3RhbmNlb2YgQ1NTUHJvcFR3ZWVuKSkge1xuXHRcdFx0XHRcdF9vdmVyd3JpdGVQcm9wcy5wdXNoKHRoaXMubik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5yID0gcjsgLy9yb3VuZCAoYm9vbGVhbilcblx0XHRcdFx0dGhpcy50eXBlID0gdHlwZSB8fCAwOyAvLzAgPSBub3JtYWwgdHdlZW4sIC0xID0gbm9uLXR3ZWVuaW5nIChpbiB3aGljaCBjYXNlIHhzMCB3aWxsIGJlIGFwcGxpZWQgdG8gdGhlIHRhcmdldCdzIHByb3BlcnR5LCBsaWtlIHRwLnRbdHAucF0gPSB0cC54czApLCAxID0gY29tcGxleC12YWx1ZSBTcGVjaWFsUHJvcCwgMiA9IGN1c3RvbSBzZXRSYXRpbygpIHRoYXQgZG9lcyBhbGwgdGhlIHdvcmtcblx0XHRcdFx0aWYgKHByKSB7XG5cdFx0XHRcdFx0dGhpcy5wciA9IHByO1xuXHRcdFx0XHRcdF9oYXNQcmlvcml0eSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5iID0gKGIgPT09IHVuZGVmaW5lZCkgPyBzIDogYjtcblx0XHRcdFx0dGhpcy5lID0gKGUgPT09IHVuZGVmaW5lZCkgPyBzICsgYyA6IGU7XG5cdFx0XHRcdGlmIChuZXh0KSB7XG5cdFx0XHRcdFx0dGhpcy5fbmV4dCA9IG5leHQ7XG5cdFx0XHRcdFx0bmV4dC5fcHJldiA9IHRoaXM7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdF9hZGROb25Ud2VlbmluZ051bWVyaWNQVCA9IGZ1bmN0aW9uKHRhcmdldCwgcHJvcCwgc3RhcnQsIGVuZCwgbmV4dCwgb3ZlcndyaXRlUHJvcCkgeyAvL2NsZWFucyB1cCBzb21lIGNvZGUgcmVkdW5kYW5jaWVzIGFuZCBoZWxwcyBtaW5pZmljYXRpb24uIEp1c3QgYSBmYXN0IHdheSB0byBhZGQgYSBOVU1FUklDIG5vbi10d2VlbmluZyBDU1NQcm9wVHdlZW5cblx0XHRcdFx0dmFyIHB0ID0gbmV3IENTU1Byb3BUd2Vlbih0YXJnZXQsIHByb3AsIHN0YXJ0LCBlbmQgLSBzdGFydCwgbmV4dCwgLTEsIG92ZXJ3cml0ZVByb3ApO1xuXHRcdFx0XHRwdC5iID0gc3RhcnQ7XG5cdFx0XHRcdHB0LmUgPSBwdC54czAgPSBlbmQ7XG5cdFx0XHRcdHJldHVybiBwdDtcblx0XHRcdH0sXG5cblx0XHRcdC8qKlxuXHRcdFx0ICogVGFrZXMgYSB0YXJnZXQsIHRoZSBiZWdpbm5pbmcgdmFsdWUgYW5kIGVuZGluZyB2YWx1ZSAoYXMgc3RyaW5ncykgYW5kIHBhcnNlcyB0aGVtIGludG8gYSBDU1NQcm9wVHdlZW4gKHBvc3NpYmx5IHdpdGggY2hpbGQgQ1NTUHJvcFR3ZWVucykgdGhhdCBhY2NvbW1vZGF0ZXMgbXVsdGlwbGUgbnVtYmVycywgY29sb3JzLCBjb21tYS1kZWxpbWl0ZWQgdmFsdWVzLCBldGMuIEZvciBleGFtcGxlOlxuXHRcdFx0ICogc3AucGFyc2VDb21wbGV4KGVsZW1lbnQsIFwiYm94U2hhZG93XCIsIFwiNXB4IDEwcHggMjBweCByZ2IoMjU1LDEwMiw1MSlcIiwgXCIwcHggMHB4IDBweCByZWRcIiwgdHJ1ZSwgXCIwcHggMHB4IDBweCByZ2IoMCwwLDAsMClcIiwgcHQpO1xuXHRcdFx0ICogSXQgd2lsbCB3YWxrIHRocm91Z2ggdGhlIGJlZ2lubmluZyBhbmQgZW5kaW5nIHZhbHVlcyAod2hpY2ggc2hvdWxkIGJlIGluIHRoZSBzYW1lIGZvcm1hdCB3aXRoIHRoZSBzYW1lIG51bWJlciBhbmQgdHlwZSBvZiB2YWx1ZXMpIGFuZCBmaWd1cmUgb3V0IHdoaWNoIHBhcnRzIGFyZSBudW1iZXJzLCB3aGF0IHN0cmluZ3Mgc2VwYXJhdGUgdGhlIG51bWVyaWMvdHdlZW5hYmxlIHZhbHVlcywgYW5kIHRoZW4gY3JlYXRlIHRoZSBDU1NQcm9wVHdlZW5zIGFjY29yZGluZ2x5LiBJZiBhIHBsdWdpbiBpcyBkZWZpbmVkLCBubyBjaGlsZCBDU1NQcm9wVHdlZW5zIHdpbGwgYmUgY3JlYXRlZC4gSW5zdGVhZCwgdGhlIGVuZGluZyB2YWx1ZXMgd2lsbCBiZSBzdG9yZWQgaW4gdGhlIFwiZGF0YVwiIHByb3BlcnR5IG9mIHRoZSByZXR1cm5lZCBDU1NQcm9wVHdlZW4gbGlrZToge3M6LTUsIHhuMTotMTAsIHhuMjotMjAsIHhuMzoyNTUsIHhuNDowLCB4bjU6MH0gc28gdGhhdCBpdCBjYW4gYmUgZmVkIHRvIGFueSBvdGhlciBwbHVnaW4gYW5kIGl0J2xsIGJlIHBsYWluIG51bWVyaWMgdHdlZW5zIGJ1dCB0aGUgcmVjb21wb3NpdGlvbiBvZiB0aGUgY29tcGxleCB2YWx1ZSB3aWxsIGJlIGhhbmRsZWQgaW5zaWRlIENTU1BsdWdpbidzIHNldFJhdGlvKCkuXG5cdFx0XHQgKiBJZiBhIHNldFJhdGlvIGlzIGRlZmluZWQsIHRoZSB0eXBlIG9mIHRoZSBDU1NQcm9wVHdlZW4gd2lsbCBiZSBzZXQgdG8gMiBhbmQgcmVjb21wb3NpdGlvbiBvZiB0aGUgdmFsdWVzIHdpbGwgYmUgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIHRoYXQgbWV0aG9kLlxuXHRcdFx0ICpcblx0XHRcdCAqIEBwYXJhbSB7IU9iamVjdH0gdCBUYXJnZXQgd2hvc2UgcHJvcGVydHkgd2lsbCBiZSB0d2VlbmVkXG5cdFx0XHQgKiBAcGFyYW0geyFzdHJpbmd9IHAgUHJvcGVydHkgdGhhdCB3aWxsIGJlIHR3ZWVuZWQgKGl0cyBuYW1lLCBsaWtlIFwibGVmdFwiIG9yIFwiYmFja2dyb3VuZENvbG9yXCIgb3IgXCJib3hTaGFkb3dcIilcblx0XHRcdCAqIEBwYXJhbSB7c3RyaW5nfSBiIEJlZ2lubmluZyB2YWx1ZVxuXHRcdFx0ICogQHBhcmFtIHtzdHJpbmd9IGUgRW5kaW5nIHZhbHVlXG5cdFx0XHQgKiBAcGFyYW0ge2Jvb2xlYW59IGNscnMgSWYgdHJ1ZSwgdGhlIHZhbHVlIGNvdWxkIGNvbnRhaW4gYSBjb2xvciB2YWx1ZSBsaWtlIFwicmdiKDI1NSwwLDApXCIgb3IgXCIjRjAwXCIgb3IgXCJyZWRcIi4gVGhlIGRlZmF1bHQgaXMgZmFsc2UsIHNvIG5vIGNvbG9ycyB3aWxsIGJlIHJlY29nbml6ZWQgKGEgcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uKVxuXHRcdFx0ICogQHBhcmFtIHsoc3RyaW5nfG51bWJlcnxPYmplY3QpfSBkZmx0IFRoZSBkZWZhdWx0IGJlZ2lubmluZyB2YWx1ZSB0aGF0IHNob3VsZCBiZSB1c2VkIGlmIG5vIHZhbGlkIGJlZ2lubmluZyB2YWx1ZSBpcyBkZWZpbmVkIG9yIGlmIHRoZSBudW1iZXIgb2YgdmFsdWVzIGluc2lkZSB0aGUgY29tcGxleCBiZWdpbm5pbmcgYW5kIGVuZGluZyB2YWx1ZXMgZG9uJ3QgbWF0Y2hcblx0XHRcdCAqIEBwYXJhbSB7P0NTU1Byb3BUd2Vlbn0gcHQgQ1NTUHJvcFR3ZWVuIGluc3RhbmNlIHRoYXQgaXMgdGhlIGN1cnJlbnQgaGVhZCBvZiB0aGUgbGlua2VkIGxpc3QgKHdlJ2xsIHByZXBlbmQgdG8gdGhpcykuXG5cdFx0XHQgKiBAcGFyYW0ge251bWJlcj19IHByIFByaW9yaXR5IGluIHRoZSBsaW5rZWQgbGlzdCBvcmRlci4gSGlnaGVyIHByaW9yaXR5IHByb3BlcnRpZXMgd2lsbCBiZSB1cGRhdGVkIGJlZm9yZSBsb3dlciBwcmlvcml0eSBvbmVzLiBUaGUgZGVmYXVsdCBwcmlvcml0eSBpcyAwLlxuXHRcdFx0ICogQHBhcmFtIHtUd2VlblBsdWdpbj19IHBsdWdpbiBJZiBhIHBsdWdpbiBzaG91bGQgaGFuZGxlIHRoZSB0d2VlbmluZyBvZiBleHRyYSBwcm9wZXJ0aWVzLCBwYXNzIHRoZSBwbHVnaW4gaW5zdGFuY2UgaGVyZS4gSWYgb25lIGlzIGRlZmluZWQsIHRoZW4gTk8gc3VidHdlZW5zIHdpbGwgYmUgY3JlYXRlZCBmb3IgYW55IGV4dHJhIHByb3BlcnRpZXMgKHRoZSBwcm9wZXJ0aWVzIHdpbGwgYmUgY3JlYXRlZCAtIGp1c3Qgbm90IGFkZGl0aW9uYWwgQ1NTUHJvcFR3ZWVuIGluc3RhbmNlcyB0byB0d2VlbiB0aGVtKSBiZWNhdXNlIHRoZSBwbHVnaW4gaXMgZXhwZWN0ZWQgdG8gZG8gc28uIEhvd2V2ZXIsIHRoZSBlbmQgdmFsdWVzIFdJTEwgYmUgcG9wdWxhdGVkIGluIHRoZSBcImRhdGFcIiBwcm9wZXJ0eSwgbGlrZSB7czoxMDAsIHhuMTo1MCwgeG4yOjMwMH1cblx0XHRcdCAqIEBwYXJhbSB7ZnVuY3Rpb24obnVtYmVyKT19IHNldFJhdGlvIElmIHZhbHVlcyBzaG91bGQgYmUgc2V0IGluIGEgY3VzdG9tIGZ1bmN0aW9uIGluc3RlYWQgb2YgYmVpbmcgcGllY2VkIHRvZ2V0aGVyIGluIGEgdHlwZToxIChjb21wbGV4LXZhbHVlKSBDU1NQcm9wVHdlZW4sIGRlZmluZSB0aGF0IGN1c3RvbSBmdW5jdGlvbiBoZXJlLlxuXHRcdFx0ICogQHJldHVybiB7Q1NTUHJvcFR3ZWVufSBUaGUgZmlyc3QgQ1NTUHJvcFR3ZWVuIGluIHRoZSBsaW5rZWQgbGlzdCB3aGljaCBpbmNsdWRlcyB0aGUgbmV3IG9uZShzKSBhZGRlZCBieSB0aGUgcGFyc2VDb21wbGV4KCkgY2FsbC5cblx0XHRcdCAqL1xuXHRcdFx0X3BhcnNlQ29tcGxleCA9IENTU1BsdWdpbi5wYXJzZUNvbXBsZXggPSBmdW5jdGlvbih0LCBwLCBiLCBlLCBjbHJzLCBkZmx0LCBwdCwgcHIsIHBsdWdpbiwgc2V0UmF0aW8pIHtcblx0XHRcdFx0Ly9ERUJVRzogX2xvZyhcInBhcnNlQ29tcGxleDogXCIrcCtcIiwgYjogXCIrYitcIiwgZTogXCIrZSk7XG5cdFx0XHRcdGIgPSBiIHx8IGRmbHQgfHwgXCJcIjtcblx0XHRcdFx0cHQgPSBuZXcgQ1NTUHJvcFR3ZWVuKHQsIHAsIDAsIDAsIHB0LCAoc2V0UmF0aW8gPyAyIDogMSksIG51bGwsIGZhbHNlLCBwciwgYiwgZSk7XG5cdFx0XHRcdGUgKz0gXCJcIjsgLy9lbnN1cmVzIGl0J3MgYSBzdHJpbmdcblx0XHRcdFx0dmFyIGJhID0gYi5zcGxpdChcIiwgXCIpLmpvaW4oXCIsXCIpLnNwbGl0KFwiIFwiKSwgLy9iZWdpbm5pbmcgYXJyYXlcblx0XHRcdFx0XHRlYSA9IGUuc3BsaXQoXCIsIFwiKS5qb2luKFwiLFwiKS5zcGxpdChcIiBcIiksIC8vZW5kaW5nIGFycmF5XG5cdFx0XHRcdFx0bCA9IGJhLmxlbmd0aCxcblx0XHRcdFx0XHRhdXRvUm91bmQgPSAoX2F1dG9Sb3VuZCAhPT0gZmFsc2UpLFxuXHRcdFx0XHRcdGksIHhpLCBuaSwgYnYsIGV2LCBibnVtcywgZW51bXMsIGJuLCBoYXNBbHBoYSwgdGVtcCwgY3YsIHN0ciwgdXNlSFNMO1xuXHRcdFx0XHRpZiAoZS5pbmRleE9mKFwiLFwiKSAhPT0gLTEgfHwgYi5pbmRleE9mKFwiLFwiKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRiYSA9IGJhLmpvaW4oXCIgXCIpLnJlcGxhY2UoX2NvbW1hc091dHNpZGVQYXJlbkV4cCwgXCIsIFwiKS5zcGxpdChcIiBcIik7XG5cdFx0XHRcdFx0ZWEgPSBlYS5qb2luKFwiIFwiKS5yZXBsYWNlKF9jb21tYXNPdXRzaWRlUGFyZW5FeHAsIFwiLCBcIikuc3BsaXQoXCIgXCIpO1xuXHRcdFx0XHRcdGwgPSBiYS5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGwgIT09IGVhLmxlbmd0aCkge1xuXHRcdFx0XHRcdC8vREVCVUc6IF9sb2coXCJtaXNtYXRjaGVkIGZvcm1hdHRpbmcgZGV0ZWN0ZWQgb24gXCIgKyBwICsgXCIgKFwiICsgYiArIFwiIHZzIFwiICsgZSArIFwiKVwiKTtcblx0XHRcdFx0XHRiYSA9IChkZmx0IHx8IFwiXCIpLnNwbGl0KFwiIFwiKTtcblx0XHRcdFx0XHRsID0gYmEubGVuZ3RoO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHB0LnBsdWdpbiA9IHBsdWdpbjtcblx0XHRcdFx0cHQuc2V0UmF0aW8gPSBzZXRSYXRpbztcblx0XHRcdFx0X2NvbG9yRXhwLmxhc3RJbmRleCA9IDA7XG5cdFx0XHRcdGZvciAoaSA9IDA7IGkgPCBsOyBpKyspIHtcblx0XHRcdFx0XHRidiA9IGJhW2ldO1xuXHRcdFx0XHRcdGV2ID0gZWFbaV07XG5cdFx0XHRcdFx0Ym4gPSBwYXJzZUZsb2F0KGJ2KTtcblx0XHRcdFx0XHQvL2lmIHRoZSB2YWx1ZSBiZWdpbnMgd2l0aCBhIG51bWJlciAobW9zdCBjb21tb24pLiBJdCdzIGZpbmUgaWYgaXQgaGFzIGEgc3VmZml4IGxpa2UgcHhcblx0XHRcdFx0XHRpZiAoYm4gfHwgYm4gPT09IDApIHtcblx0XHRcdFx0XHRcdHB0LmFwcGVuZFh0cmEoXCJcIiwgYm4sIF9wYXJzZUNoYW5nZShldiwgYm4pLCBldi5yZXBsYWNlKF9yZWxOdW1FeHAsIFwiXCIpLCAoYXV0b1JvdW5kICYmIGV2LmluZGV4T2YoXCJweFwiKSAhPT0gLTEpLCB0cnVlKTtcblxuXHRcdFx0XHRcdC8vaWYgdGhlIHZhbHVlIGlzIGEgY29sb3Jcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNscnMgJiYgX2NvbG9yRXhwLnRlc3QoYnYpKSB7XG5cdFx0XHRcdFx0XHRzdHIgPSBldi5jaGFyQXQoZXYubGVuZ3RoIC0gMSkgPT09IFwiLFwiID8gXCIpLFwiIDogXCIpXCI7IC8vaWYgdGhlcmUncyBhIGNvbW1hIGF0IHRoZSBlbmQsIHJldGFpbiBpdC5cblx0XHRcdFx0XHRcdHVzZUhTTCA9IChldi5pbmRleE9mKFwiaHNsXCIpICE9PSAtMSAmJiBfc3VwcG9ydHNPcGFjaXR5KTtcblx0XHRcdFx0XHRcdGJ2ID0gX3BhcnNlQ29sb3IoYnYsIHVzZUhTTCk7XG5cdFx0XHRcdFx0XHRldiA9IF9wYXJzZUNvbG9yKGV2LCB1c2VIU0wpO1xuXHRcdFx0XHRcdFx0aGFzQWxwaGEgPSAoYnYubGVuZ3RoICsgZXYubGVuZ3RoID4gNik7XG5cdFx0XHRcdFx0XHRpZiAoaGFzQWxwaGEgJiYgIV9zdXBwb3J0c09wYWNpdHkgJiYgZXZbM10gPT09IDApIHsgLy9vbGRlciB2ZXJzaW9ucyBvZiBJRSBkb24ndCBzdXBwb3J0IHJnYmEoKSwgc28gaWYgdGhlIGRlc3RpbmF0aW9uIGFscGhhIGlzIDAsIGp1c3QgdXNlIFwidHJhbnNwYXJlbnRcIiBmb3IgdGhlIGVuZCBjb2xvclxuXHRcdFx0XHRcdFx0XHRwdFtcInhzXCIgKyBwdC5sXSArPSBwdC5sID8gXCIgdHJhbnNwYXJlbnRcIiA6IFwidHJhbnNwYXJlbnRcIjtcblx0XHRcdFx0XHRcdFx0cHQuZSA9IHB0LmUuc3BsaXQoZWFbaV0pLmpvaW4oXCJ0cmFuc3BhcmVudFwiKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGlmICghX3N1cHBvcnRzT3BhY2l0eSkgeyAvL29sZCB2ZXJzaW9ucyBvZiBJRSBkb24ndCBzdXBwb3J0IHJnYmEoKS5cblx0XHRcdFx0XHRcdFx0XHRoYXNBbHBoYSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICh1c2VIU0wpIHtcblx0XHRcdFx0XHRcdFx0XHRwdC5hcHBlbmRYdHJhKChoYXNBbHBoYSA/IFwiaHNsYShcIiA6IFwiaHNsKFwiKSwgYnZbMF0sIF9wYXJzZUNoYW5nZShldlswXSwgYnZbMF0pLCBcIixcIiwgZmFsc2UsIHRydWUpXG5cdFx0XHRcdFx0XHRcdFx0XHQuYXBwZW5kWHRyYShcIlwiLCBidlsxXSwgX3BhcnNlQ2hhbmdlKGV2WzFdLCBidlsxXSksIFwiJSxcIiwgZmFsc2UpXG5cdFx0XHRcdFx0XHRcdFx0XHQuYXBwZW5kWHRyYShcIlwiLCBidlsyXSwgX3BhcnNlQ2hhbmdlKGV2WzJdLCBidlsyXSksIChoYXNBbHBoYSA/IFwiJSxcIiA6IFwiJVwiICsgc3RyKSwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHB0LmFwcGVuZFh0cmEoKGhhc0FscGhhID8gXCJyZ2JhKFwiIDogXCJyZ2IoXCIpLCBidlswXSwgZXZbMF0gLSBidlswXSwgXCIsXCIsIHRydWUsIHRydWUpXG5cdFx0XHRcdFx0XHRcdFx0XHQuYXBwZW5kWHRyYShcIlwiLCBidlsxXSwgZXZbMV0gLSBidlsxXSwgXCIsXCIsIHRydWUpXG5cdFx0XHRcdFx0XHRcdFx0XHQuYXBwZW5kWHRyYShcIlwiLCBidlsyXSwgZXZbMl0gLSBidlsyXSwgKGhhc0FscGhhID8gXCIsXCIgOiBzdHIpLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGlmIChoYXNBbHBoYSkge1xuXHRcdFx0XHRcdFx0XHRcdGJ2ID0gKGJ2Lmxlbmd0aCA8IDQpID8gMSA6IGJ2WzNdO1xuXHRcdFx0XHRcdFx0XHRcdHB0LmFwcGVuZFh0cmEoXCJcIiwgYnYsICgoZXYubGVuZ3RoIDwgNCkgPyAxIDogZXZbM10pIC0gYnYsIHN0ciwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRfY29sb3JFeHAubGFzdEluZGV4ID0gMDsgLy9vdGhlcndpc2UgdGhlIHRlc3QoKSBvbiB0aGUgUmVnRXhwIGNvdWxkIG1vdmUgdGhlIGxhc3RJbmRleCBhbmQgdGFpbnQgZnV0dXJlIHJlc3VsdHMuXG5cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ym51bXMgPSBidi5tYXRjaChfbnVtRXhwKTsgLy9nZXRzIGVhY2ggZ3JvdXAgb2YgbnVtYmVycyBpbiB0aGUgYmVnaW5uaW5nIHZhbHVlIHN0cmluZyBhbmQgZHJvcHMgdGhlbSBpbnRvIGFuIGFycmF5XG5cblx0XHRcdFx0XHRcdC8vaWYgbm8gbnVtYmVyIGlzIGZvdW5kLCB0cmVhdCBpdCBhcyBhIG5vbi10d2VlbmluZyB2YWx1ZSBhbmQganVzdCBhcHBlbmQgdGhlIHN0cmluZyB0byB0aGUgY3VycmVudCB4cy5cblx0XHRcdFx0XHRcdGlmICghYm51bXMpIHtcblx0XHRcdFx0XHRcdFx0cHRbXCJ4c1wiICsgcHQubF0gKz0gcHQubCA/IFwiIFwiICsgYnYgOiBidjtcblxuXHRcdFx0XHRcdFx0Ly9sb29wIHRocm91Z2ggYWxsIHRoZSBudW1iZXJzIHRoYXQgYXJlIGZvdW5kIGFuZCBjb25zdHJ1Y3QgdGhlIGV4dHJhIHZhbHVlcyBvbiB0aGUgcHQuXG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRlbnVtcyA9IGV2Lm1hdGNoKF9yZWxOdW1FeHApOyAvL2dldCBlYWNoIGdyb3VwIG9mIG51bWJlcnMgaW4gdGhlIGVuZCB2YWx1ZSBzdHJpbmcgYW5kIGRyb3AgdGhlbSBpbnRvIGFuIGFycmF5LiBXZSBhbGxvdyByZWxhdGl2ZSB2YWx1ZXMgdG9vLCBsaWtlICs9NTAgb3IgLT0uNVxuXHRcdFx0XHRcdFx0XHRpZiAoIWVudW1zIHx8IGVudW1zLmxlbmd0aCAhPT0gYm51bXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly9ERUJVRzogX2xvZyhcIm1pc21hdGNoZWQgZm9ybWF0dGluZyBkZXRlY3RlZCBvbiBcIiArIHAgKyBcIiAoXCIgKyBiICsgXCIgdnMgXCIgKyBlICsgXCIpXCIpO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBwdDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRuaSA9IDA7XG5cdFx0XHRcdFx0XHRcdGZvciAoeGkgPSAwOyB4aSA8IGJudW1zLmxlbmd0aDsgeGkrKykge1xuXHRcdFx0XHRcdFx0XHRcdGN2ID0gYm51bXNbeGldO1xuXHRcdFx0XHRcdFx0XHRcdHRlbXAgPSBidi5pbmRleE9mKGN2LCBuaSk7XG5cdFx0XHRcdFx0XHRcdFx0cHQuYXBwZW5kWHRyYShidi5zdWJzdHIobmksIHRlbXAgLSBuaSksIE51bWJlcihjdiksIF9wYXJzZUNoYW5nZShlbnVtc1t4aV0sIGN2KSwgXCJcIiwgKGF1dG9Sb3VuZCAmJiBidi5zdWJzdHIodGVtcCArIGN2Lmxlbmd0aCwgMikgPT09IFwicHhcIiksICh4aSA9PT0gMCkpO1xuXHRcdFx0XHRcdFx0XHRcdG5pID0gdGVtcCArIGN2Lmxlbmd0aDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRwdFtcInhzXCIgKyBwdC5sXSArPSBidi5zdWJzdHIobmkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvL2lmIHRoZXJlIGFyZSByZWxhdGl2ZSB2YWx1ZXMgKFwiKz1cIiBvciBcIi09XCIgcHJlZml4KSwgd2UgbmVlZCB0byBhZGp1c3QgdGhlIGVuZGluZyB2YWx1ZSB0byBlbGltaW5hdGUgdGhlIHByZWZpeGVzIGFuZCBjb21iaW5lIHRoZSB2YWx1ZXMgcHJvcGVybHkuXG5cdFx0XHRcdGlmIChlLmluZGV4T2YoXCI9XCIpICE9PSAtMSkgaWYgKHB0LmRhdGEpIHtcblx0XHRcdFx0XHRzdHIgPSBwdC54czAgKyBwdC5kYXRhLnM7XG5cdFx0XHRcdFx0Zm9yIChpID0gMTsgaSA8IHB0Lmw7IGkrKykge1xuXHRcdFx0XHRcdFx0c3RyICs9IHB0W1wieHNcIiArIGldICsgcHQuZGF0YVtcInhuXCIgKyBpXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHQuZSA9IHN0ciArIHB0W1wieHNcIiArIGldO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcHQubCkge1xuXHRcdFx0XHRcdHB0LnR5cGUgPSAtMTtcblx0XHRcdFx0XHRwdC54czAgPSBwdC5lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwdC54Zmlyc3QgfHwgcHQ7XG5cdFx0XHR9LFxuXHRcdFx0aSA9IDk7XG5cblxuXHRcdHAgPSBDU1NQcm9wVHdlZW4ucHJvdG90eXBlO1xuXHRcdHAubCA9IHAucHIgPSAwOyAvL2xlbmd0aCAobnVtYmVyIG9mIGV4dHJhIHByb3BlcnRpZXMgbGlrZSB4bjEsIHhuMiwgeG4zLCBldGMuXG5cdFx0d2hpbGUgKC0taSA+IDApIHtcblx0XHRcdHBbXCJ4blwiICsgaV0gPSAwO1xuXHRcdFx0cFtcInhzXCIgKyBpXSA9IFwiXCI7XG5cdFx0fVxuXHRcdHAueHMwID0gXCJcIjtcblx0XHRwLl9uZXh0ID0gcC5fcHJldiA9IHAueGZpcnN0ID0gcC5kYXRhID0gcC5wbHVnaW4gPSBwLnNldFJhdGlvID0gcC5yeHAgPSBudWxsO1xuXG5cblx0XHQvKipcblx0XHQgKiBBcHBlbmRzIGFuZCBleHRyYSB0d2VlbmluZyB2YWx1ZSB0byBhIENTU1Byb3BUd2VlbiBhbmQgYXV0b21hdGljYWxseSBtYW5hZ2VzIGFueSBwcmVmaXggYW5kIHN1ZmZpeCBzdHJpbmdzLiBUaGUgZmlyc3QgZXh0cmEgdmFsdWUgaXMgc3RvcmVkIGluIHRoZSBzIGFuZCBjIG9mIHRoZSBtYWluIENTU1Byb3BUd2VlbiBpbnN0YW5jZSwgYnV0IHRoZXJlYWZ0ZXIgYW55IGV4dHJhcyBhcmUgc3RvcmVkIGluIHRoZSB4bjEsIHhuMiwgeG4zLCBldGMuIFRoZSBwcmVmaXhlcyBhbmQgc3VmZml4ZXMgYXJlIHN0b3JlZCBpbiB0aGUgeHMwLCB4czEsIHhzMiwgZXRjLiBwcm9wZXJ0aWVzLiBGb3IgZXhhbXBsZSwgaWYgSSB3YWxrIHRocm91Z2ggYSBjbGlwIHZhbHVlIGxpa2UgXCJyZWN0KDEwcHgsIDVweCwgMHB4LCAyMHB4KVwiLCB0aGUgdmFsdWVzIHdvdWxkIGJlIHN0b3JlZCBsaWtlIHRoaXM6XG5cdFx0ICogeHMwOlwicmVjdChcIiwgczoxMCwgeHMxOlwicHgsIFwiLCB4bjE6NSwgeHMyOlwicHgsIFwiLCB4bjI6MCwgeHMzOlwicHgsIFwiLCB4bjM6MjAsIHhuNDpcInB4KVwiXG5cdFx0ICogQW5kIHRoZXknZCBhbGwgZ2V0IGpvaW5lZCB0b2dldGhlciB3aGVuIHRoZSBDU1NQbHVnaW4gcmVuZGVycyAoaW4gdGhlIHNldFJhdGlvKCkgbWV0aG9kKS5cblx0XHQgKiBAcGFyYW0ge3N0cmluZz19IHBmeCBQcmVmaXggKGlmIGFueSlcblx0XHQgKiBAcGFyYW0geyFudW1iZXJ9IHMgU3RhcnRpbmcgdmFsdWVcblx0XHQgKiBAcGFyYW0geyFudW1iZXJ9IGMgQ2hhbmdlIGluIG51bWVyaWMgdmFsdWUgb3ZlciB0aGUgY291cnNlIG9mIHRoZSBlbnRpcmUgdHdlZW4uIEZvciBleGFtcGxlLCBpZiB0aGUgc3RhcnQgaXMgNSBhbmQgdGhlIGVuZCBpcyAxMDAsIHRoZSBjaGFuZ2Ugd291bGQgYmUgOTUuXG5cdFx0ICogQHBhcmFtIHtzdHJpbmc9fSBzZnggU3VmZml4IChpZiBhbnkpXG5cdFx0ICogQHBhcmFtIHtib29sZWFuPX0gciBSb3VuZCAoaWYgdHJ1ZSkuXG5cdFx0ICogQHBhcmFtIHtib29sZWFuPX0gcGFkIElmIHRydWUsIHRoaXMgZXh0cmEgdmFsdWUgc2hvdWxkIGJlIHNlcGFyYXRlZCBieSB0aGUgcHJldmlvdXMgb25lIGJ5IGEgc3BhY2UuIElmIHRoZXJlIGlzIG5vIHByZXZpb3VzIGV4dHJhIGFuZCBwYWQgaXMgdHJ1ZSwgaXQgd2lsbCBhdXRvbWF0aWNhbGx5IGRyb3AgdGhlIHNwYWNlLlxuXHRcdCAqIEByZXR1cm4ge0NTU1Byb3BUd2Vlbn0gcmV0dXJucyBpdHNlbGYgc28gdGhhdCBtdWx0aXBsZSBtZXRob2RzIGNhbiBiZSBjaGFpbmVkIHRvZ2V0aGVyLlxuXHRcdCAqL1xuXHRcdHAuYXBwZW5kWHRyYSA9IGZ1bmN0aW9uKHBmeCwgcywgYywgc2Z4LCByLCBwYWQpIHtcblx0XHRcdHZhciBwdCA9IHRoaXMsXG5cdFx0XHRcdGwgPSBwdC5sO1xuXHRcdFx0cHRbXCJ4c1wiICsgbF0gKz0gKHBhZCAmJiBsKSA/IFwiIFwiICsgcGZ4IDogcGZ4IHx8IFwiXCI7XG5cdFx0XHRpZiAoIWMpIGlmIChsICE9PSAwICYmICFwdC5wbHVnaW4pIHsgLy90eXBpY2FsbHkgd2UnbGwgY29tYmluZSBub24tY2hhbmdpbmcgdmFsdWVzIHJpZ2h0IGludG8gdGhlIHhzIHRvIG9wdGltaXplIHBlcmZvcm1hbmNlLCBidXQgd2UgZG9uJ3QgY29tYmluZSB0aGVtIHdoZW4gdGhlcmUncyBhIHBsdWdpbiB0aGF0IHdpbGwgYmUgdHdlZW5pbmcgdGhlIHZhbHVlcyBiZWNhdXNlIGl0IG1heSBkZXBlbmQgb24gdGhlIHZhbHVlcyBiZWluZyBzcGxpdCBhcGFydCwgbGlrZSBmb3IgYSBiZXppZXIsIGlmIGEgdmFsdWUgZG9lc24ndCBjaGFuZ2UgYmV0d2VlbiB0aGUgZmlyc3QgYW5kIHNlY29uZCBpdGVyYXRpb24gYnV0IHRoZW4gaXQgZG9lcyBvbiB0aGUgM3JkLCB3ZSdsbCBydW4gaW50byB0cm91YmxlIGJlY2F1c2UgdGhlcmUncyBubyB4biBzbG90IGZvciB0aGF0IHZhbHVlIVxuXHRcdFx0XHRwdFtcInhzXCIgKyBsXSArPSBzICsgKHNmeCB8fCBcIlwiKTtcblx0XHRcdFx0cmV0dXJuIHB0O1xuXHRcdFx0fVxuXHRcdFx0cHQubCsrO1xuXHRcdFx0cHQudHlwZSA9IHB0LnNldFJhdGlvID8gMiA6IDE7XG5cdFx0XHRwdFtcInhzXCIgKyBwdC5sXSA9IHNmeCB8fCBcIlwiO1xuXHRcdFx0aWYgKGwgPiAwKSB7XG5cdFx0XHRcdHB0LmRhdGFbXCJ4blwiICsgbF0gPSBzICsgYztcblx0XHRcdFx0cHQucnhwW1wieG5cIiArIGxdID0gcjsgLy9yb3VuZCBleHRyYSBwcm9wZXJ0eSAod2UgbmVlZCB0byB0YXAgaW50byB0aGlzIGluIHRoZSBfcGFyc2VUb1Byb3h5KCkgbWV0aG9kKVxuXHRcdFx0XHRwdFtcInhuXCIgKyBsXSA9IHM7XG5cdFx0XHRcdGlmICghcHQucGx1Z2luKSB7XG5cdFx0XHRcdFx0cHQueGZpcnN0ID0gbmV3IENTU1Byb3BUd2VlbihwdCwgXCJ4blwiICsgbCwgcywgYywgcHQueGZpcnN0IHx8IHB0LCAwLCBwdC5uLCByLCBwdC5wcik7XG5cdFx0XHRcdFx0cHQueGZpcnN0LnhzMCA9IDA7IC8vanVzdCB0byBlbnN1cmUgdGhhdCB0aGUgcHJvcGVydHkgc3RheXMgbnVtZXJpYyB3aGljaCBoZWxwcyBtb2Rlcm4gYnJvd3NlcnMgc3BlZWQgdXAgcHJvY2Vzc2luZy4gUmVtZW1iZXIsIGluIHRoZSBzZXRSYXRpbygpIG1ldGhvZCwgd2UgZG8gcHQudFtwdC5wXSA9IHZhbCArIHB0LnhzMCBzbyBpZiBwdC54czAgaXMgXCJcIiAodGhlIGRlZmF1bHQpLCBpdCdsbCBjYXN0IHRoZSBlbmQgdmFsdWUgYXMgYSBzdHJpbmcuIFdoZW4gYSBwcm9wZXJ0eSBpcyBhIG51bWJlciBzb21ldGltZXMgYW5kIGEgc3RyaW5nIHNvbWV0aW1lcywgaXQgcHJldmVudHMgdGhlIGNvbXBpbGVyIGZyb20gbG9ja2luZyBpbiB0aGUgZGF0YSB0eXBlLCBzbG93aW5nIHRoaW5ncyBkb3duIHNsaWdodGx5LlxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwdDtcblx0XHRcdH1cblx0XHRcdHB0LmRhdGEgPSB7czpzICsgY307XG5cdFx0XHRwdC5yeHAgPSB7fTtcblx0XHRcdHB0LnMgPSBzO1xuXHRcdFx0cHQuYyA9IGM7XG5cdFx0XHRwdC5yID0gcjtcblx0XHRcdHJldHVybiBwdDtcblx0XHR9O1xuXG5cdFx0LyoqXG5cdFx0ICogQGNvbnN0cnVjdG9yIEEgU3BlY2lhbFByb3AgaXMgYmFzaWNhbGx5IGEgY3NzIHByb3BlcnR5IHRoYXQgbmVlZHMgdG8gYmUgdHJlYXRlZCBpbiBhIG5vbi1zdGFuZGFyZCB3YXksIGxpa2UgaWYgaXQgbWF5IGNvbnRhaW4gYSBjb21wbGV4IHZhbHVlIGxpa2UgYm94U2hhZG93OlwiNXB4IDEwcHggMTVweCByZ2IoMjU1LCAxMDIsIDUxKVwiIG9yIGlmIGl0IGlzIGFzc29jaWF0ZWQgd2l0aCBhbm90aGVyIHBsdWdpbiBsaWtlIFRocm93UHJvcHNQbHVnaW4gb3IgQmV6aWVyUGx1Z2luLiBFdmVyeSBTcGVjaWFsUHJvcCBpcyBhc3NvY2lhdGVkIHdpdGggYSBwYXJ0aWN1bGFyIHByb3BlcnR5IG5hbWUgbGlrZSBcImJveFNoYWRvd1wiIG9yIFwidGhyb3dQcm9wc1wiIG9yIFwiYmV6aWVyXCIgYW5kIGl0IHdpbGwgaW50ZXJjZXB0IHRob3NlIHZhbHVlcyBpbiB0aGUgdmFycyBvYmplY3QgdGhhdCdzIHBhc3NlZCB0byB0aGUgQ1NTUGx1Z2luIGFuZCBoYW5kbGUgdGhlbSBhY2NvcmRpbmdseS5cblx0XHQgKiBAcGFyYW0geyFzdHJpbmd9IHAgUHJvcGVydHkgbmFtZSAobGlrZSBcImJveFNoYWRvd1wiIG9yIFwidGhyb3dQcm9wc1wiKVxuXHRcdCAqIEBwYXJhbSB7T2JqZWN0PX0gb3B0aW9ucyBBbiBvYmplY3QgY29udGFpbmluZyBhbnkgb2YgdGhlIGZvbGxvd2luZyBjb25maWd1cmF0aW9uIG9wdGlvbnM6XG5cdFx0ICogICAgICAgICAgICAgICAgICAgICAgLSBkZWZhdWx0VmFsdWU6IHRoZSBkZWZhdWx0IHZhbHVlXG5cdFx0ICogICAgICAgICAgICAgICAgICAgICAgLSBwYXJzZXI6IEEgZnVuY3Rpb24gdGhhdCBzaG91bGQgYmUgY2FsbGVkIHdoZW4gdGhlIGFzc29jaWF0ZWQgcHJvcGVydHkgbmFtZSBpcyBmb3VuZCBpbiB0aGUgdmFycy4gVGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIGEgQ1NTUHJvcFR3ZWVuIGluc3RhbmNlIGFuZCBpdCBzaG91bGQgZW5zdXJlIHRoYXQgaXQgaXMgcHJvcGVybHkgaW5zZXJ0ZWQgaW50byB0aGUgbGlua2VkIGxpc3QuIEl0IHdpbGwgcmVjZWl2ZSA0IHBhcmFtdGVyczogMSkgVGhlIHRhcmdldCwgMikgVGhlIHZhbHVlIGRlZmluZWQgaW4gdGhlIHZhcnMsIDMpIFRoZSBDU1NQbHVnaW4gaW5zdGFuY2UgKHdob3NlIF9maXJzdFBUIHNob3VsZCBiZSB1c2VkIGZvciB0aGUgbGlua2VkIGxpc3QpLCBhbmQgNCkgQSBjb21wdXRlZCBzdHlsZSBvYmplY3QgaWYgb25lIHdhcyBjYWxjdWxhdGVkICh0aGlzIGlzIGEgc3BlZWQgb3B0aW1pemF0aW9uIHRoYXQgYWxsb3dzIHJldHJpZXZhbCBvZiBzdGFydGluZyB2YWx1ZXMgcXVpY2tlcilcblx0XHQgKiAgICAgICAgICAgICAgICAgICAgICAtIGZvcm1hdHRlcjogYSBmdW5jdGlvbiB0aGF0IGZvcm1hdHMgYW55IHZhbHVlIHJlY2VpdmVkIGZvciB0aGlzIHNwZWNpYWwgcHJvcGVydHkgKGZvciBleGFtcGxlLCBib3hTaGFkb3cgY291bGQgdGFrZSBcIjVweCA1cHggcmVkXCIgYW5kIGZvcm1hdCBpdCB0byBcIjVweCA1cHggMHB4IDBweCByZWRcIiBzbyB0aGF0IGJvdGggdGhlIGJlZ2lubmluZyBhbmQgZW5kaW5nIHZhbHVlcyBoYXZlIGEgY29tbW9uIG9yZGVyIGFuZCBxdWFudGl0eSBvZiB2YWx1ZXMuKVxuXHRcdCAqICAgICAgICAgICAgICAgICAgICAgIC0gcHJlZml4OiBpZiB0cnVlLCB3ZSdsbCBkZXRlcm1pbmUgd2hldGhlciBvciBub3QgdGhpcyBwcm9wZXJ0eSByZXF1aXJlcyBhIHZlbmRvciBwcmVmaXggKGxpa2UgV2Via2l0IG9yIE1veiBvciBtcyBvciBPKVxuXHRcdCAqICAgICAgICAgICAgICAgICAgICAgIC0gY29sb3I6IHNldCB0aGlzIHRvIHRydWUgaWYgdGhlIHZhbHVlIGZvciB0aGlzIFNwZWNpYWxQcm9wIG1heSBjb250YWluIGNvbG9yLXJlbGF0ZWQgdmFsdWVzIGxpa2UgcmdiKCksIHJnYmEoKSwgZXRjLlxuXHRcdCAqICAgICAgICAgICAgICAgICAgICAgIC0gcHJpb3JpdHk6IHByaW9yaXR5IGluIHRoZSBsaW5rZWQgbGlzdCBvcmRlci4gSGlnaGVyIHByaW9yaXR5IFNwZWNpYWxQcm9wcyB3aWxsIGJlIHVwZGF0ZWQgYmVmb3JlIGxvd2VyIHByaW9yaXR5IG9uZXMuIFRoZSBkZWZhdWx0IHByaW9yaXR5IGlzIDAuXG5cdFx0ICogICAgICAgICAgICAgICAgICAgICAgLSBtdWx0aTogaWYgdHJ1ZSwgdGhlIGZvcm1hdHRlciBzaG91bGQgYWNjb21tb2RhdGUgYSBjb21tYS1kZWxpbWl0ZWQgbGlzdCBvZiB2YWx1ZXMsIGxpa2UgYm94U2hhZG93IGNvdWxkIGhhdmUgbXVsdGlwbGUgYm94U2hhZG93cyBsaXN0ZWQgb3V0LlxuXHRcdCAqICAgICAgICAgICAgICAgICAgICAgIC0gY29sbGFwc2libGU6IGlmIHRydWUsIHRoZSBmb3JtYXR0ZXIgc2hvdWxkIHRyZWF0IHRoZSB2YWx1ZSBsaWtlIGl0J3MgYSB0b3AvcmlnaHQvYm90dG9tL2xlZnQgdmFsdWUgdGhhdCBjb3VsZCBiZSBjb2xsYXBzZWQsIGxpa2UgXCI1cHhcIiB3b3VsZCBhcHBseSB0byBhbGwsIFwiNXB4LCAxMHB4XCIgd291bGQgdXNlIDVweCBmb3IgdG9wL2JvdHRvbSBhbmQgMTBweCBmb3IgcmlnaHQvbGVmdCwgZXRjLlxuXHRcdCAqICAgICAgICAgICAgICAgICAgICAgIC0ga2V5d29yZDogYSBzcGVjaWFsIGtleXdvcmQgdGhhdCBjYW4gW29wdGlvbmFsbHldIGJlIGZvdW5kIGluc2lkZSB0aGUgdmFsdWUgKGxpa2UgXCJpbnNldFwiIGZvciBib3hTaGFkb3cpLiBUaGlzIGFsbG93cyB1cyB0byB2YWxpZGF0ZSBiZWdpbm5pbmcvZW5kaW5nIHZhbHVlcyB0byBtYWtlIHN1cmUgdGhleSBtYXRjaCAoaWYgdGhlIGtleXdvcmQgaXMgZm91bmQgaW4gb25lLCBpdCdsbCBiZSBhZGRlZCB0byB0aGUgb3RoZXIgZm9yIGNvbnNpc3RlbmN5IGJ5IGRlZmF1bHQpLlxuXHRcdCAqL1xuXHRcdHZhciBTcGVjaWFsUHJvcCA9IGZ1bmN0aW9uKHAsIG9wdGlvbnMpIHtcblx0XHRcdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cdFx0XHRcdHRoaXMucCA9IG9wdGlvbnMucHJlZml4ID8gX2NoZWNrUHJvcFByZWZpeChwKSB8fCBwIDogcDtcblx0XHRcdFx0X3NwZWNpYWxQcm9wc1twXSA9IF9zcGVjaWFsUHJvcHNbdGhpcy5wXSA9IHRoaXM7XG5cdFx0XHRcdHRoaXMuZm9ybWF0ID0gb3B0aW9ucy5mb3JtYXR0ZXIgfHwgX2dldEZvcm1hdHRlcihvcHRpb25zLmRlZmF1bHRWYWx1ZSwgb3B0aW9ucy5jb2xvciwgb3B0aW9ucy5jb2xsYXBzaWJsZSwgb3B0aW9ucy5tdWx0aSk7XG5cdFx0XHRcdGlmIChvcHRpb25zLnBhcnNlcikge1xuXHRcdFx0XHRcdHRoaXMucGFyc2UgPSBvcHRpb25zLnBhcnNlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmNscnMgPSBvcHRpb25zLmNvbG9yO1xuXHRcdFx0XHR0aGlzLm11bHRpID0gb3B0aW9ucy5tdWx0aTtcblx0XHRcdFx0dGhpcy5rZXl3b3JkID0gb3B0aW9ucy5rZXl3b3JkO1xuXHRcdFx0XHR0aGlzLmRmbHQgPSBvcHRpb25zLmRlZmF1bHRWYWx1ZTtcblx0XHRcdFx0dGhpcy5wciA9IG9wdGlvbnMucHJpb3JpdHkgfHwgMDtcblx0XHRcdH0sXG5cblx0XHRcdC8vc2hvcnRjdXQgZm9yIGNyZWF0aW5nIGEgbmV3IFNwZWNpYWxQcm9wIHRoYXQgY2FuIGFjY2VwdCBtdWx0aXBsZSBwcm9wZXJ0aWVzIGFzIGEgY29tbWEtZGVsaW1pdGVkIGxpc3QgKGhlbHBzIG1pbmlmaWNhdGlvbikuIGRmbHQgY2FuIGJlIGFuIGFycmF5IGZvciBtdWx0aXBsZSB2YWx1ZXMgKHdlIGRvbid0IGRvIGEgY29tbWEtZGVsaW1pdGVkIGxpc3QgYmVjYXVzZSB0aGUgZGVmYXVsdCB2YWx1ZSBtYXkgY29udGFpbiBjb21tYXMsIGxpa2UgcmVjdCgwcHgsMHB4LDBweCwwcHgpKS4gV2UgYXR0YWNoIHRoaXMgbWV0aG9kIHRvIHRoZSBTcGVjaWFsUHJvcCBjbGFzcy9vYmplY3QgaW5zdGVhZCBvZiB1c2luZyBhIHByaXZhdGUgX2NyZWF0ZVNwZWNpYWxQcm9wKCkgbWV0aG9kIHNvIHRoYXQgd2UgY2FuIHRhcCBpbnRvIGl0IGV4dGVybmFsbHkgaWYgbmVjZXNzYXJ5LCBsaWtlIGZyb20gYW5vdGhlciBwbHVnaW4uXG5cdFx0XHRfcmVnaXN0ZXJDb21wbGV4U3BlY2lhbFByb3AgPSBfaW50ZXJuYWxzLl9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcCA9IGZ1bmN0aW9uKHAsIG9wdGlvbnMsIGRlZmF1bHRzKSB7XG5cdFx0XHRcdGlmICh0eXBlb2Yob3B0aW9ucykgIT09IFwib2JqZWN0XCIpIHtcblx0XHRcdFx0XHRvcHRpb25zID0ge3BhcnNlcjpkZWZhdWx0c307IC8vdG8gbWFrZSBiYWNrd2FyZHMgY29tcGF0aWJsZSB3aXRoIG9sZGVyIHZlcnNpb25zIG9mIEJlemllclBsdWdpbiBhbmQgVGhyb3dQcm9wc1BsdWdpblxuXHRcdFx0XHR9XG5cdFx0XHRcdHZhciBhID0gcC5zcGxpdChcIixcIiksXG5cdFx0XHRcdFx0ZCA9IG9wdGlvbnMuZGVmYXVsdFZhbHVlLFxuXHRcdFx0XHRcdGksIHRlbXA7XG5cdFx0XHRcdGRlZmF1bHRzID0gZGVmYXVsdHMgfHwgW2RdO1xuXHRcdFx0XHRmb3IgKGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdG9wdGlvbnMucHJlZml4ID0gKGkgPT09IDAgJiYgb3B0aW9ucy5wcmVmaXgpO1xuXHRcdFx0XHRcdG9wdGlvbnMuZGVmYXVsdFZhbHVlID0gZGVmYXVsdHNbaV0gfHwgZDtcblx0XHRcdFx0XHR0ZW1wID0gbmV3IFNwZWNpYWxQcm9wKGFbaV0sIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHQvL2NyZWF0ZXMgYSBwbGFjZWhvbGRlciBzcGVjaWFsIHByb3AgZm9yIGEgcGx1Z2luIHNvIHRoYXQgdGhlIHByb3BlcnR5IGdldHMgY2F1Z2h0IHRoZSBmaXJzdCB0aW1lIGEgdHdlZW4gb2YgaXQgaXMgYXR0ZW1wdGVkLCBhbmQgYXQgdGhhdCB0aW1lIGl0IG1ha2VzIHRoZSBwbHVnaW4gcmVnaXN0ZXIgaXRzZWxmLCB0aHVzIHRha2luZyBvdmVyIGZvciBhbGwgZnV0dXJlIHR3ZWVucyBvZiB0aGF0IHByb3BlcnR5LiBUaGlzIGFsbG93cyB1cyB0byBub3QgbWFuZGF0ZSB0aGF0IHRoaW5ncyBsb2FkIGluIGEgcGFydGljdWxhciBvcmRlciBhbmQgaXQgYWxzbyBhbGxvd3MgdXMgdG8gbG9nKCkgYW4gZXJyb3IgdGhhdCBpbmZvcm1zIHRoZSB1c2VyIHdoZW4gdGhleSBhdHRlbXB0IHRvIHR3ZWVuIGFuIGV4dGVybmFsIHBsdWdpbi1yZWxhdGVkIHByb3BlcnR5IHdpdGhvdXQgbG9hZGluZyBpdHMgLmpzIGZpbGUuXG5cdFx0XHRfcmVnaXN0ZXJQbHVnaW5Qcm9wID0gZnVuY3Rpb24ocCkge1xuXHRcdFx0XHRpZiAoIV9zcGVjaWFsUHJvcHNbcF0pIHtcblx0XHRcdFx0XHR2YXIgcGx1Z2luTmFtZSA9IHAuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBwLnN1YnN0cigxKSArIFwiUGx1Z2luXCI7XG5cdFx0XHRcdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKHAsIHtwYXJzZXI6ZnVuY3Rpb24odCwgZSwgcCwgY3NzcCwgcHQsIHBsdWdpbiwgdmFycykge1xuXHRcdFx0XHRcdFx0dmFyIHBsdWdpbkNsYXNzID0gX2dsb2JhbHMuY29tLmdyZWVuc29jay5wbHVnaW5zW3BsdWdpbk5hbWVdO1xuXHRcdFx0XHRcdFx0aWYgKCFwbHVnaW5DbGFzcykge1xuXHRcdFx0XHRcdFx0XHRfbG9nKFwiRXJyb3I6IFwiICsgcGx1Z2luTmFtZSArIFwiIGpzIGZpbGUgbm90IGxvYWRlZC5cIik7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBwdDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHBsdWdpbkNsYXNzLl9jc3NSZWdpc3RlcigpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9zcGVjaWFsUHJvcHNbcF0ucGFyc2UodCwgZSwgcCwgY3NzcCwgcHQsIHBsdWdpbiwgdmFycyk7XG5cdFx0XHRcdFx0fX0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cblx0XHRwID0gU3BlY2lhbFByb3AucHJvdG90eXBlO1xuXG5cdFx0LyoqXG5cdFx0ICogQWxpYXMgZm9yIF9wYXJzZUNvbXBsZXgoKSB0aGF0IGF1dG9tYXRpY2FsbHkgcGx1Z3MgaW4gY2VydGFpbiB2YWx1ZXMgZm9yIHRoaXMgU3BlY2lhbFByb3AsIGxpa2UgaXRzIHByb3BlcnR5IG5hbWUsIHdoZXRoZXIgb3Igbm90IGNvbG9ycyBzaG91bGQgYmUgc2Vuc2VkLCB0aGUgZGVmYXVsdCB2YWx1ZSwgYW5kIHByaW9yaXR5LiBJdCBhbHNvIGxvb2tzIGZvciBhbnkga2V5d29yZCB0aGF0IHRoZSBTcGVjaWFsUHJvcCBkZWZpbmVzIChsaWtlIFwiaW5zZXRcIiBmb3IgYm94U2hhZG93KSBhbmQgZW5zdXJlcyB0aGF0IHRoZSBiZWdpbm5pbmcgYW5kIGVuZGluZyB2YWx1ZXMgaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgdmFsdWVzIGZvciBTcGVjaWFsUHJvcHMgd2hlcmUgbXVsdGkgaXMgdHJ1ZSAobGlrZSBib3hTaGFkb3cgYW5kIHRleHRTaGFkb3cgY2FuIGhhdmUgYSBjb21tYS1kZWxpbWl0ZWQgbGlzdClcblx0XHQgKiBAcGFyYW0geyFPYmplY3R9IHQgdGFyZ2V0IGVsZW1lbnRcblx0XHQgKiBAcGFyYW0geyhzdHJpbmd8bnVtYmVyfG9iamVjdCl9IGIgYmVnaW5uaW5nIHZhbHVlXG5cdFx0ICogQHBhcmFtIHsoc3RyaW5nfG51bWJlcnxvYmplY3QpfSBlIGVuZGluZyAoZGVzdGluYXRpb24pIHZhbHVlXG5cdFx0ICogQHBhcmFtIHtDU1NQcm9wVHdlZW49fSBwdCBuZXh0IENTU1Byb3BUd2VlbiBpbiB0aGUgbGlua2VkIGxpc3Rcblx0XHQgKiBAcGFyYW0ge1R3ZWVuUGx1Z2luPX0gcGx1Z2luIElmIGFub3RoZXIgcGx1Z2luIHdpbGwgYmUgdHdlZW5pbmcgdGhlIGNvbXBsZXggdmFsdWUsIHRoYXQgVHdlZW5QbHVnaW4gaW5zdGFuY2UgZ29lcyBoZXJlLlxuXHRcdCAqIEBwYXJhbSB7ZnVuY3Rpb249fSBzZXRSYXRpbyBJZiBhIGN1c3RvbSBzZXRSYXRpbygpIG1ldGhvZCBzaG91bGQgYmUgdXNlZCB0byBoYW5kbGUgdGhpcyBjb21wbGV4IHZhbHVlLCB0aGF0IGdvZXMgaGVyZS5cblx0XHQgKiBAcmV0dXJuIHtDU1NQcm9wVHdlZW49fSBGaXJzdCBDU1NQcm9wVHdlZW4gaW4gdGhlIGxpbmtlZCBsaXN0XG5cdFx0ICovXG5cdFx0cC5wYXJzZUNvbXBsZXggPSBmdW5jdGlvbih0LCBiLCBlLCBwdCwgcGx1Z2luLCBzZXRSYXRpbykge1xuXHRcdFx0dmFyIGt3ZCA9IHRoaXMua2V5d29yZCxcblx0XHRcdFx0aSwgYmEsIGVhLCBsLCBiaSwgZWk7XG5cdFx0XHQvL2lmIHRoaXMgU3BlY2lhbFByb3AncyB2YWx1ZSBjYW4gY29udGFpbiBhIGNvbW1hLWRlbGltaXRlZCBsaXN0IG9mIHZhbHVlcyAobGlrZSBib3hTaGFkb3cgb3IgdGV4dFNoYWRvdyksIHdlIG11c3QgcGFyc2UgdGhlbSBpbiBhIHNwZWNpYWwgd2F5LCBhbmQgbG9vayBmb3IgYSBrZXl3b3JkIChsaWtlIFwiaW5zZXRcIiBmb3IgYm94U2hhZG93KSBhbmQgZW5zdXJlIHRoYXQgdGhlIGJlZ2lubmluZyBhbmQgZW5kaW5nIEJPVEggaGF2ZSBpdCBpZiB0aGUgZW5kIGRlZmluZXMgaXQgYXMgc3VjaC4gV2UgYWxzbyBtdXN0IGVuc3VyZSB0aGF0IHRoZXJlIGFyZSBhbiBlcXVhbCBudW1iZXIgb2YgdmFsdWVzIHNwZWNpZmllZCAod2UgY2FuJ3QgdHdlZW4gMSBib3hTaGFkb3cgdG8gMyBmb3IgZXhhbXBsZSlcblx0XHRcdGlmICh0aGlzLm11bHRpKSBpZiAoX2NvbW1hc091dHNpZGVQYXJlbkV4cC50ZXN0KGUpIHx8IF9jb21tYXNPdXRzaWRlUGFyZW5FeHAudGVzdChiKSkge1xuXHRcdFx0XHRiYSA9IGIucmVwbGFjZShfY29tbWFzT3V0c2lkZVBhcmVuRXhwLCBcInxcIikuc3BsaXQoXCJ8XCIpO1xuXHRcdFx0XHRlYSA9IGUucmVwbGFjZShfY29tbWFzT3V0c2lkZVBhcmVuRXhwLCBcInxcIikuc3BsaXQoXCJ8XCIpO1xuXHRcdFx0fSBlbHNlIGlmIChrd2QpIHtcblx0XHRcdFx0YmEgPSBbYl07XG5cdFx0XHRcdGVhID0gW2VdO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVhKSB7XG5cdFx0XHRcdGwgPSAoZWEubGVuZ3RoID4gYmEubGVuZ3RoKSA/IGVhLmxlbmd0aCA6IGJhLmxlbmd0aDtcblx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuXHRcdFx0XHRcdGIgPSBiYVtpXSA9IGJhW2ldIHx8IHRoaXMuZGZsdDtcblx0XHRcdFx0XHRlID0gZWFbaV0gPSBlYVtpXSB8fCB0aGlzLmRmbHQ7XG5cdFx0XHRcdFx0aWYgKGt3ZCkge1xuXHRcdFx0XHRcdFx0YmkgPSBiLmluZGV4T2Yoa3dkKTtcblx0XHRcdFx0XHRcdGVpID0gZS5pbmRleE9mKGt3ZCk7XG5cdFx0XHRcdFx0XHRpZiAoYmkgIT09IGVpKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChlaSA9PT0gLTEpIHsgLy9pZiB0aGUga2V5d29yZCBpc24ndCBpbiB0aGUgZW5kIHZhbHVlLCByZW1vdmUgaXQgZnJvbSB0aGUgYmVnaW5uaW5nIG9uZS5cblx0XHRcdFx0XHRcdFx0XHRiYVtpXSA9IGJhW2ldLnNwbGl0KGt3ZCkuam9pbihcIlwiKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChiaSA9PT0gLTEpIHsgLy9pZiB0aGUga2V5d29yZCBpc24ndCBpbiB0aGUgYmVnaW5uaW5nLCBhZGQgaXQuXG5cdFx0XHRcdFx0XHRcdFx0YmFbaV0gKz0gXCIgXCIgKyBrd2Q7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YiA9IGJhLmpvaW4oXCIsIFwiKTtcblx0XHRcdFx0ZSA9IGVhLmpvaW4oXCIsIFwiKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBfcGFyc2VDb21wbGV4KHQsIHRoaXMucCwgYiwgZSwgdGhpcy5jbHJzLCB0aGlzLmRmbHQsIHB0LCB0aGlzLnByLCBwbHVnaW4sIHNldFJhdGlvKTtcblx0XHR9O1xuXG5cdFx0LyoqXG5cdFx0ICogQWNjZXB0cyBhIHRhcmdldCBhbmQgZW5kIHZhbHVlIGFuZCBzcGl0cyBiYWNrIGEgQ1NTUHJvcFR3ZWVuIHRoYXQgaGFzIGJlZW4gaW5zZXJ0ZWQgaW50byB0aGUgQ1NTUGx1Z2luJ3MgbGlua2VkIGxpc3QgYW5kIGNvbmZvcm1zIHdpdGggYWxsIHRoZSBjb252ZW50aW9ucyB3ZSB1c2UgaW50ZXJuYWxseSwgbGlrZSB0eXBlOi0xLCAwLCAxLCBvciAyLCBzZXR0aW5nIHVwIGFueSBleHRyYSBwcm9wZXJ0eSB0d2VlbnMsIHByaW9yaXR5LCBldGMuIEZvciBleGFtcGxlLCBpZiB3ZSBoYXZlIGEgYm94U2hhZG93IFNwZWNpYWxQcm9wIGFuZCBjYWxsOlxuXHRcdCAqIHRoaXMuX2ZpcnN0UFQgPSBzcC5wYXJzZShlbGVtZW50LCBcIjVweCAxMHB4IDIwcHggcmdiKDI1NTAsMTAyLDUxKVwiLCBcImJveFNoYWRvd1wiLCB0aGlzKTtcblx0XHQgKiBJdCBzaG91bGQgZmlndXJlIG91dCB0aGUgc3RhcnRpbmcgdmFsdWUgb2YgdGhlIGVsZW1lbnQncyBib3hTaGFkb3csIGNvbXBhcmUgaXQgdG8gdGhlIHByb3ZpZGVkIGVuZCB2YWx1ZSBhbmQgY3JlYXRlIGFsbCB0aGUgbmVjZXNzYXJ5IENTU1Byb3BUd2VlbnMgb2YgdGhlIGFwcHJvcHJpYXRlIHR5cGVzIHRvIHR3ZWVuIHRoZSBib3hTaGFkb3cuIFRoZSBDU1NQcm9wVHdlZW4gdGhhdCBnZXRzIHNwaXQgYmFjayBzaG91bGQgYWxyZWFkeSBiZSBpbnNlcnRlZCBpbnRvIHRoZSBsaW5rZWQgbGlzdCAodGhlIDR0aCBwYXJhbWV0ZXIgaXMgdGhlIGN1cnJlbnQgaGVhZCwgc28gcHJlcGVuZCB0byB0aGF0KS5cblx0XHQgKiBAcGFyYW0geyFPYmplY3R9IHQgVGFyZ2V0IG9iamVjdCB3aG9zZSBwcm9wZXJ0eSBpcyBiZWluZyB0d2VlbmVkXG5cdFx0ICogQHBhcmFtIHtPYmplY3R9IGUgRW5kIHZhbHVlIGFzIHByb3ZpZGVkIGluIHRoZSB2YXJzIG9iamVjdCAodHlwaWNhbGx5IGEgc3RyaW5nLCBidXQgbm90IGFsd2F5cyAtIGxpa2UgYSB0aHJvd1Byb3BzIHdvdWxkIGJlIGFuIG9iamVjdCkuXG5cdFx0ICogQHBhcmFtIHshc3RyaW5nfSBwIFByb3BlcnR5IG5hbWVcblx0XHQgKiBAcGFyYW0geyFDU1NQbHVnaW59IGNzc3AgVGhlIENTU1BsdWdpbiBpbnN0YW5jZSB0aGF0IHNob3VsZCBiZSBhc3NvY2lhdGVkIHdpdGggdGhpcyB0d2Vlbi5cblx0XHQgKiBAcGFyYW0gez9DU1NQcm9wVHdlZW59IHB0IFRoZSBDU1NQcm9wVHdlZW4gdGhhdCBpcyB0aGUgY3VycmVudCBoZWFkIG9mIHRoZSBsaW5rZWQgbGlzdCAod2UnbGwgcHJlcGVuZCB0byBpdClcblx0XHQgKiBAcGFyYW0ge1R3ZWVuUGx1Z2luPX0gcGx1Z2luIElmIGEgcGx1Z2luIHdpbGwgYmUgdXNlZCB0byB0d2VlbiB0aGUgcGFyc2VkIHZhbHVlLCB0aGlzIGlzIHRoZSBwbHVnaW4gaW5zdGFuY2UuXG5cdFx0ICogQHBhcmFtIHtPYmplY3Q9fSB2YXJzIE9yaWdpbmFsIHZhcnMgb2JqZWN0IHRoYXQgY29udGFpbnMgdGhlIGRhdGEgZm9yIHBhcnNpbmcuXG5cdFx0ICogQHJldHVybiB7Q1NTUHJvcFR3ZWVufSBUaGUgZmlyc3QgQ1NTUHJvcFR3ZWVuIGluIHRoZSBsaW5rZWQgbGlzdCB3aGljaCBpbmNsdWRlcyB0aGUgbmV3IG9uZShzKSBhZGRlZCBieSB0aGUgcGFyc2UoKSBjYWxsLlxuXHRcdCAqL1xuXHRcdHAucGFyc2UgPSBmdW5jdGlvbih0LCBlLCBwLCBjc3NwLCBwdCwgcGx1Z2luLCB2YXJzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJzZUNvbXBsZXgodC5zdHlsZSwgdGhpcy5mb3JtYXQoX2dldFN0eWxlKHQsIHRoaXMucCwgX2NzLCBmYWxzZSwgdGhpcy5kZmx0KSksIHRoaXMuZm9ybWF0KGUpLCBwdCwgcGx1Z2luKTtcblx0XHR9O1xuXG5cdFx0LyoqXG5cdFx0ICogUmVnaXN0ZXJzIGEgc3BlY2lhbCBwcm9wZXJ0eSB0aGF0IHNob3VsZCBiZSBpbnRlcmNlcHRlZCBmcm9tIGFueSBcImNzc1wiIG9iamVjdHMgZGVmaW5lZCBpbiB0d2VlbnMuIFRoaXMgYWxsb3dzIHlvdSB0byBoYW5kbGUgdGhlbSBob3dldmVyIHlvdSB3YW50IHdpdGhvdXQgQ1NTUGx1Z2luIGRvaW5nIGl0IGZvciB5b3UuIFRoZSAybmQgcGFyYW1ldGVyIHNob3VsZCBiZSBhIGZ1bmN0aW9uIHRoYXQgYWNjZXB0cyAzIHBhcmFtZXRlcnM6XG5cdFx0ICogIDEpIFRhcmdldCBvYmplY3Qgd2hvc2UgcHJvcGVydHkgc2hvdWxkIGJlIHR3ZWVuZWQgKHR5cGljYWxseSBhIERPTSBlbGVtZW50KVxuXHRcdCAqICAyKSBUaGUgZW5kL2Rlc3RpbmF0aW9uIHZhbHVlIChjb3VsZCBiZSBhIHN0cmluZywgbnVtYmVyLCBvYmplY3QsIG9yIHdoYXRldmVyIHlvdSB3YW50KVxuXHRcdCAqICAzKSBUaGUgdHdlZW4gaW5zdGFuY2UgKHlvdSBwcm9iYWJseSBkb24ndCBuZWVkIHRvIHdvcnJ5IGFib3V0IHRoaXMsIGJ1dCBpdCBjYW4gYmUgdXNlZnVsIGZvciBsb29raW5nIHVwIGluZm9ybWF0aW9uIGxpa2UgdGhlIGR1cmF0aW9uKVxuXHRcdCAqXG5cdFx0ICogVGhlbiwgeW91ciBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIGEgZnVuY3Rpb24gd2hpY2ggd2lsbCBiZSBjYWxsZWQgZWFjaCB0aW1lIHRoZSB0d2VlbiBnZXRzIHJlbmRlcmVkLCBwYXNzaW5nIGEgbnVtZXJpYyBcInJhdGlvXCIgcGFyYW1ldGVyIHRvIHlvdXIgZnVuY3Rpb24gdGhhdCBpbmRpY2F0ZXMgdGhlIGNoYW5nZSBmYWN0b3IgKHVzdWFsbHkgYmV0d2VlbiAwIGFuZCAxKS4gRm9yIGV4YW1wbGU6XG5cdFx0ICpcblx0XHQgKiBDU1NQbHVnaW4ucmVnaXN0ZXJTcGVjaWFsUHJvcChcIm15Q3VzdG9tUHJvcFwiLCBmdW5jdGlvbih0YXJnZXQsIHZhbHVlLCB0d2Vlbikge1xuXHRcdCAqICAgICAgdmFyIHN0YXJ0ID0gdGFyZ2V0LnN0eWxlLndpZHRoO1xuXHRcdCAqICAgICAgcmV0dXJuIGZ1bmN0aW9uKHJhdGlvKSB7XG5cdFx0ICogICAgICAgICAgICAgIHRhcmdldC5zdHlsZS53aWR0aCA9IChzdGFydCArIHZhbHVlICogcmF0aW8pICsgXCJweFwiO1xuXHRcdCAqICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcInNldCB3aWR0aCB0byBcIiArIHRhcmdldC5zdHlsZS53aWR0aCk7XG5cdFx0ICogICAgICAgICAgfVxuXHRcdCAqIH0sIDApO1xuXHRcdCAqXG5cdFx0ICogVGhlbiwgd2hlbiBJIGRvIHRoaXMgdHdlZW4sIGl0IHdpbGwgdHJpZ2dlciBteSBzcGVjaWFsIHByb3BlcnR5OlxuXHRcdCAqXG5cdFx0ICogVHdlZW5MaXRlLnRvKGVsZW1lbnQsIDEsIHtjc3M6e215Q3VzdG9tUHJvcDoxMDB9fSk7XG5cdFx0ICpcblx0XHQgKiBJbiB0aGUgZXhhbXBsZSwgb2YgY291cnNlLCB3ZSdyZSBqdXN0IGNoYW5naW5nIHRoZSB3aWR0aCwgYnV0IHlvdSBjYW4gZG8gYW55dGhpbmcgeW91IHdhbnQuXG5cdFx0ICpcblx0XHQgKiBAcGFyYW0geyFzdHJpbmd9IG5hbWUgUHJvcGVydHkgbmFtZSAob3IgY29tbWEtZGVsaW1pdGVkIGxpc3Qgb2YgcHJvcGVydHkgbmFtZXMpIHRoYXQgc2hvdWxkIGJlIGludGVyY2VwdGVkIGFuZCBoYW5kbGVkIGJ5IHlvdXIgZnVuY3Rpb24uIEZvciBleGFtcGxlLCBpZiBJIGRlZmluZSBcIm15Q3VzdG9tUHJvcFwiLCB0aGVuIGl0IHdvdWxkIGhhbmRsZSB0aGF0IHBvcnRpb24gb2YgdGhlIGZvbGxvd2luZyB0d2VlbjogVHdlZW5MaXRlLnRvKGVsZW1lbnQsIDEsIHtjc3M6e215Q3VzdG9tUHJvcDoxMDB9fSlcblx0XHQgKiBAcGFyYW0geyFmdW5jdGlvbihPYmplY3QsIE9iamVjdCwgT2JqZWN0LCBzdHJpbmcpOmZ1bmN0aW9uKG51bWJlcil9IG9uSW5pdFR3ZWVuIFRoZSBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgY2FsbGVkIHdoZW4gYSB0d2VlbiBvZiB0aGlzIHNwZWNpYWwgcHJvcGVydHkgaXMgcGVyZm9ybWVkLiBUaGUgZnVuY3Rpb24gd2lsbCByZWNlaXZlIDQgcGFyYW1ldGVyczogMSkgVGFyZ2V0IG9iamVjdCB0aGF0IHNob3VsZCBiZSB0d2VlbmVkLCAyKSBWYWx1ZSB0aGF0IHdhcyBwYXNzZWQgdG8gdGhlIHR3ZWVuLCAzKSBUaGUgdHdlZW4gaW5zdGFuY2UgaXRzZWxmIChyYXJlbHkgdXNlZCksIGFuZCA0KSBUaGUgcHJvcGVydHkgbmFtZSB0aGF0J3MgYmVpbmcgdHdlZW5lZC4gWW91ciBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIGEgZnVuY3Rpb24gdGhhdCBzaG91bGQgYmUgY2FsbGVkIG9uIGV2ZXJ5IHVwZGF0ZSBvZiB0aGUgdHdlZW4uIFRoYXQgZnVuY3Rpb24gd2lsbCByZWNlaXZlIGEgc2luZ2xlIHBhcmFtZXRlciB0aGF0IGlzIGEgXCJjaGFuZ2UgZmFjdG9yXCIgdmFsdWUgKHR5cGljYWxseSBiZXR3ZWVuIDAgYW5kIDEpIGluZGljYXRpbmcgdGhlIGFtb3VudCBvZiBjaGFuZ2UgYXMgYSByYXRpby4gWW91IGNhbiB1c2UgdGhpcyB0byBkZXRlcm1pbmUgaG93IHRvIHNldCB0aGUgdmFsdWVzIGFwcHJvcHJpYXRlbHkgaW4geW91ciBmdW5jdGlvbi5cblx0XHQgKiBAcGFyYW0ge251bWJlcj19IHByaW9yaXR5IFByaW9yaXR5IHRoYXQgaGVscHMgdGhlIGVuZ2luZSBkZXRlcm1pbmUgdGhlIG9yZGVyIGluIHdoaWNoIHRvIHNldCB0aGUgcHJvcGVydGllcyAoZGVmYXVsdDogMCkuIEhpZ2hlciBwcmlvcml0eSBwcm9wZXJ0aWVzIHdpbGwgYmUgdXBkYXRlZCBiZWZvcmUgbG93ZXIgcHJpb3JpdHkgb25lcy5cblx0XHQgKi9cblx0XHRDU1NQbHVnaW4ucmVnaXN0ZXJTcGVjaWFsUHJvcCA9IGZ1bmN0aW9uKG5hbWUsIG9uSW5pdFR3ZWVuLCBwcmlvcml0eSkge1xuXHRcdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKG5hbWUsIHtwYXJzZXI6ZnVuY3Rpb24odCwgZSwgcCwgY3NzcCwgcHQsIHBsdWdpbiwgdmFycykge1xuXHRcdFx0XHR2YXIgcnYgPSBuZXcgQ1NTUHJvcFR3ZWVuKHQsIHAsIDAsIDAsIHB0LCAyLCBwLCBmYWxzZSwgcHJpb3JpdHkpO1xuXHRcdFx0XHRydi5wbHVnaW4gPSBwbHVnaW47XG5cdFx0XHRcdHJ2LnNldFJhdGlvID0gb25Jbml0VHdlZW4odCwgZSwgY3NzcC5fdHdlZW4sIHApO1xuXHRcdFx0XHRyZXR1cm4gcnY7XG5cdFx0XHR9LCBwcmlvcml0eTpwcmlvcml0eX0pO1xuXHRcdH07XG5cblxuXG5cblxuXG5cdFx0Ly90cmFuc2Zvcm0tcmVsYXRlZCBtZXRob2RzIGFuZCBwcm9wZXJ0aWVzXG5cdFx0Q1NTUGx1Z2luLnVzZVNWR1RyYW5zZm9ybUF0dHIgPSBfaXNTYWZhcmkgfHwgX2lzRmlyZWZveDsgLy9TYWZhcmkgYW5kIEZpcmVmb3ggYm90aCBoYXZlIHNvbWUgcmVuZGVyaW5nIGJ1Z3Mgd2hlbiBhcHBseWluZyBDU1MgdHJhbnNmb3JtcyB0byBTVkcgZWxlbWVudHMsIHNvIGRlZmF1bHQgdG8gdXNpbmcgdGhlIFwidHJhbnNmb3JtXCIgYXR0cmlidXRlIGluc3RlYWQgKHVzZXJzIGNhbiBvdmVycmlkZSB0aGlzKS5cblx0XHR2YXIgX3RyYW5zZm9ybVByb3BzID0gKFwic2NhbGVYLHNjYWxlWSxzY2FsZVoseCx5LHosc2tld1gsc2tld1kscm90YXRpb24scm90YXRpb25YLHJvdGF0aW9uWSxwZXJzcGVjdGl2ZSx4UGVyY2VudCx5UGVyY2VudFwiKS5zcGxpdChcIixcIiksXG5cdFx0XHRfdHJhbnNmb3JtUHJvcCA9IF9jaGVja1Byb3BQcmVmaXgoXCJ0cmFuc2Zvcm1cIiksIC8vdGhlIEphdmFzY3JpcHQgKGNhbWVsQ2FzZSkgdHJhbnNmb3JtIHByb3BlcnR5LCBsaWtlIG1zVHJhbnNmb3JtLCBXZWJraXRUcmFuc2Zvcm0sIE1velRyYW5zZm9ybSwgb3IgT1RyYW5zZm9ybS5cblx0XHRcdF90cmFuc2Zvcm1Qcm9wQ1NTID0gX3ByZWZpeENTUyArIFwidHJhbnNmb3JtXCIsXG5cdFx0XHRfdHJhbnNmb3JtT3JpZ2luUHJvcCA9IF9jaGVja1Byb3BQcmVmaXgoXCJ0cmFuc2Zvcm1PcmlnaW5cIiksXG5cdFx0XHRfc3VwcG9ydHMzRCA9IChfY2hlY2tQcm9wUHJlZml4KFwicGVyc3BlY3RpdmVcIikgIT09IG51bGwpLFxuXHRcdFx0VHJhbnNmb3JtID0gX2ludGVybmFscy5UcmFuc2Zvcm0gPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0dGhpcy5wZXJzcGVjdGl2ZSA9IHBhcnNlRmxvYXQoQ1NTUGx1Z2luLmRlZmF1bHRUcmFuc2Zvcm1QZXJzcGVjdGl2ZSkgfHwgMDtcblx0XHRcdFx0dGhpcy5mb3JjZTNEID0gKENTU1BsdWdpbi5kZWZhdWx0Rm9yY2UzRCA9PT0gZmFsc2UgfHwgIV9zdXBwb3J0czNEKSA/IGZhbHNlIDogQ1NTUGx1Z2luLmRlZmF1bHRGb3JjZTNEIHx8IFwiYXV0b1wiO1xuXHRcdFx0fSxcblx0XHRcdF9TVkdFbGVtZW50ID0gd2luZG93LlNWR0VsZW1lbnQsXG5cdFx0XHRfdXNlU1ZHVHJhbnNmb3JtQXR0cixcblx0XHRcdC8vU29tZSBicm93c2VycyAobGlrZSBGaXJlZm94IGFuZCBJRSkgZG9uJ3QgaG9ub3IgdHJhbnNmb3JtLW9yaWdpbiBwcm9wZXJseSBpbiBTVkcgZWxlbWVudHMsIHNvIHdlIG5lZWQgdG8gbWFudWFsbHkgYWRqdXN0IHRoZSBtYXRyaXggYWNjb3JkaW5nbHkuIFdlIGZlYXR1cmUgZGV0ZWN0IGhlcmUgcmF0aGVyIHRoYW4gYWx3YXlzIGRvaW5nIHRoZSBjb252ZXJzaW9uIGZvciBjZXJ0YWluIGJyb3dzZXJzIGJlY2F1c2UgdGhleSBtYXkgZml4IHRoZSBwcm9ibGVtIGF0IHNvbWUgcG9pbnQgaW4gdGhlIGZ1dHVyZS5cblxuXHRcdFx0X2NyZWF0ZVNWRyA9IGZ1bmN0aW9uKHR5cGUsIGNvbnRhaW5lciwgYXR0cmlidXRlcykge1xuXHRcdFx0XHR2YXIgZWxlbWVudCA9IF9kb2MuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgdHlwZSksXG5cdFx0XHRcdFx0cmVnID0gLyhbYS16XSkoW0EtWl0pL2csXG5cdFx0XHRcdFx0cDtcblx0XHRcdFx0Zm9yIChwIGluIGF0dHJpYnV0ZXMpIHtcblx0XHRcdFx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZU5TKG51bGwsIHAucmVwbGFjZShyZWcsIFwiJDEtJDJcIikudG9Mb3dlckNhc2UoKSwgYXR0cmlidXRlc1twXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudDtcblx0XHRcdH0sXG5cdFx0XHRfZG9jRWxlbWVudCA9IF9kb2MuZG9jdW1lbnRFbGVtZW50LFxuXHRcdFx0X2ZvcmNlU1ZHVHJhbnNmb3JtQXR0ciA9IChmdW5jdGlvbigpIHtcblx0XHRcdFx0Ly9JRSBhbmQgQW5kcm9pZCBzdG9jayBkb24ndCBzdXBwb3J0IENTUyB0cmFuc2Zvcm1zIG9uIFNWRyBlbGVtZW50cywgc28gd2UgbXVzdCB3cml0ZSB0aGVtIHRvIHRoZSBcInRyYW5zZm9ybVwiIGF0dHJpYnV0ZS4gV2UgcG9wdWxhdGUgdGhpcyB2YXJpYWJsZSBpbiB0aGUgX3BhcnNlVHJhbnNmb3JtKCkgbWV0aG9kLCBhbmQgb25seSBpZi93aGVuIHdlIGNvbWUgYWNyb3NzIGFuIFNWRyBlbGVtZW50XG5cdFx0XHRcdHZhciBmb3JjZSA9IF9pZVZlcnMgfHwgKC9BbmRyb2lkL2kudGVzdChfYWdlbnQpICYmICF3aW5kb3cuY2hyb21lKSxcblx0XHRcdFx0XHRzdmcsIHJlY3QsIHdpZHRoO1xuXHRcdFx0XHRpZiAoX2RvYy5jcmVhdGVFbGVtZW50TlMgJiYgIWZvcmNlKSB7IC8vSUU4IGFuZCBlYXJsaWVyIGRvZXNuJ3Qgc3VwcG9ydCBTVkcgYW55d2F5XG5cdFx0XHRcdFx0c3ZnID0gX2NyZWF0ZVNWRyhcInN2Z1wiLCBfZG9jRWxlbWVudCk7XG5cdFx0XHRcdFx0cmVjdCA9IF9jcmVhdGVTVkcoXCJyZWN0XCIsIHN2Zywge3dpZHRoOjEwMCwgaGVpZ2h0OjUwLCB4OjEwMH0pO1xuXHRcdFx0XHRcdHdpZHRoID0gcmVjdC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS53aWR0aDtcblx0XHRcdFx0XHRyZWN0LnN0eWxlW190cmFuc2Zvcm1PcmlnaW5Qcm9wXSA9IFwiNTAlIDUwJVwiO1xuXHRcdFx0XHRcdHJlY3Quc3R5bGVbX3RyYW5zZm9ybVByb3BdID0gXCJzY2FsZVgoMC41KVwiO1xuXHRcdFx0XHRcdGZvcmNlID0gKHdpZHRoID09PSByZWN0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLndpZHRoICYmICEoX2lzRmlyZWZveCAmJiBfc3VwcG9ydHMzRCkpOyAvL25vdGU6IEZpcmVmb3ggZmFpbHMgdGhlIHRlc3QgZXZlbiB0aG91Z2ggaXQgZG9lcyBzdXBwb3J0IENTUyB0cmFuc2Zvcm1zIGluIDNELiBTaW5jZSB3ZSBjYW4ndCBwdXNoIDNEIHN0dWZmIGludG8gdGhlIHRyYW5zZm9ybSBhdHRyaWJ1dGUsIHdlIGZvcmNlIEZpcmVmb3ggdG8gcGFzcyB0aGUgdGVzdCBoZXJlIChhcyBsb25nIGFzIGl0IGRvZXMgdHJ1bHkgc3VwcG9ydCAzRCkuXG5cdFx0XHRcdFx0X2RvY0VsZW1lbnQucmVtb3ZlQ2hpbGQoc3ZnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZm9yY2U7XG5cdFx0XHR9KSgpLFxuXHRcdFx0X3BhcnNlU1ZHT3JpZ2luID0gZnVuY3Rpb24oZSwgbG9jYWwsIGRlY29yYXRlZSwgYWJzb2x1dGUsIHNtb290aE9yaWdpbikge1xuXHRcdFx0XHR2YXIgdG0gPSBlLl9nc1RyYW5zZm9ybSxcblx0XHRcdFx0XHRtID0gX2dldE1hdHJpeChlLCB0cnVlKSxcblx0XHRcdFx0XHR2LCB4LCB5LCB4T3JpZ2luLCB5T3JpZ2luLCBhLCBiLCBjLCBkLCB0eCwgdHksIGRldGVybWluYW50LCB4T3JpZ2luT2xkLCB5T3JpZ2luT2xkO1xuXHRcdFx0XHRpZiAodG0pIHtcblx0XHRcdFx0XHR4T3JpZ2luT2xkID0gdG0ueE9yaWdpbjsgLy9yZWNvcmQgdGhlIG9yaWdpbmFsIHZhbHVlcyBiZWZvcmUgd2UgYWx0ZXIgdGhlbS5cblx0XHRcdFx0XHR5T3JpZ2luT2xkID0gdG0ueU9yaWdpbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWFic29sdXRlIHx8ICh2ID0gYWJzb2x1dGUuc3BsaXQoXCIgXCIpKS5sZW5ndGggPCAyKSB7XG5cdFx0XHRcdFx0YiA9IGUuZ2V0QkJveCgpO1xuXHRcdFx0XHRcdGxvY2FsID0gX3BhcnNlUG9zaXRpb24obG9jYWwpLnNwbGl0KFwiIFwiKTtcblx0XHRcdFx0XHR2ID0gWyhsb2NhbFswXS5pbmRleE9mKFwiJVwiKSAhPT0gLTEgPyBwYXJzZUZsb2F0KGxvY2FsWzBdKSAvIDEwMCAqIGIud2lkdGggOiBwYXJzZUZsb2F0KGxvY2FsWzBdKSkgKyBiLngsXG5cdFx0XHRcdFx0XHQgKGxvY2FsWzFdLmluZGV4T2YoXCIlXCIpICE9PSAtMSA/IHBhcnNlRmxvYXQobG9jYWxbMV0pIC8gMTAwICogYi5oZWlnaHQgOiBwYXJzZUZsb2F0KGxvY2FsWzFdKSkgKyBiLnldO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRlY29yYXRlZS54T3JpZ2luID0geE9yaWdpbiA9IHBhcnNlRmxvYXQodlswXSk7XG5cdFx0XHRcdGRlY29yYXRlZS55T3JpZ2luID0geU9yaWdpbiA9IHBhcnNlRmxvYXQodlsxXSk7XG5cdFx0XHRcdGlmIChhYnNvbHV0ZSAmJiBtICE9PSBfaWRlbnRpdHkyRE1hdHJpeCkgeyAvL2lmIHN2Z09yaWdpbiBpcyBiZWluZyBzZXQsIHdlIG11c3QgaW52ZXJ0IHRoZSBtYXRyaXggYW5kIGRldGVybWluZSB3aGVyZSB0aGUgYWJzb2x1dGUgcG9pbnQgaXMsIGZhY3RvcmluZyBpbiB0aGUgY3VycmVudCB0cmFuc2Zvcm1zLiBPdGhlcndpc2UsIHRoZSBzdmdPcmlnaW4gd291bGQgYmUgYmFzZWQgb24gdGhlIGVsZW1lbnQncyBub24tdHJhbnNmb3JtZWQgcG9zaXRpb24gb24gdGhlIGNhbnZhcy5cblx0XHRcdFx0XHRhID0gbVswXTtcblx0XHRcdFx0XHRiID0gbVsxXTtcblx0XHRcdFx0XHRjID0gbVsyXTtcblx0XHRcdFx0XHRkID0gbVszXTtcblx0XHRcdFx0XHR0eCA9IG1bNF07XG5cdFx0XHRcdFx0dHkgPSBtWzVdO1xuXHRcdFx0XHRcdGRldGVybWluYW50ID0gKGEgKiBkIC0gYiAqIGMpO1xuXHRcdFx0XHRcdHggPSB4T3JpZ2luICogKGQgLyBkZXRlcm1pbmFudCkgKyB5T3JpZ2luICogKC1jIC8gZGV0ZXJtaW5hbnQpICsgKChjICogdHkgLSBkICogdHgpIC8gZGV0ZXJtaW5hbnQpO1xuXHRcdFx0XHRcdHkgPSB4T3JpZ2luICogKC1iIC8gZGV0ZXJtaW5hbnQpICsgeU9yaWdpbiAqIChhIC8gZGV0ZXJtaW5hbnQpIC0gKChhICogdHkgLSBiICogdHgpIC8gZGV0ZXJtaW5hbnQpO1xuXHRcdFx0XHRcdHhPcmlnaW4gPSBkZWNvcmF0ZWUueE9yaWdpbiA9IHZbMF0gPSB4O1xuXHRcdFx0XHRcdHlPcmlnaW4gPSBkZWNvcmF0ZWUueU9yaWdpbiA9IHZbMV0gPSB5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0bSkgeyAvL2F2b2lkIGp1bXAgd2hlbiB0cmFuc2Zvcm1PcmlnaW4gaXMgY2hhbmdlZCAtIGFkanVzdCB0aGUgeC95IHZhbHVlcyBhY2NvcmRpbmdseVxuXHRcdFx0XHRcdGlmIChzbW9vdGhPcmlnaW4gfHwgKHNtb290aE9yaWdpbiAhPT0gZmFsc2UgJiYgQ1NTUGx1Z2luLmRlZmF1bHRTbW9vdGhPcmlnaW4gIT09IGZhbHNlKSkge1xuXHRcdFx0XHRcdFx0eCA9IHhPcmlnaW4gLSB4T3JpZ2luT2xkO1xuXHRcdFx0XHRcdFx0eSA9IHlPcmlnaW4gLSB5T3JpZ2luT2xkO1xuXHRcdFx0XHRcdFx0Ly9vcmlnaW5hbGx5LCB3ZSBzaW1wbHkgYWRqdXN0ZWQgdGhlIHggYW5kIHkgdmFsdWVzLCBidXQgdGhhdCB3b3VsZCBjYXVzZSBwcm9ibGVtcyBpZiwgZm9yIGV4YW1wbGUsIHlvdSBjcmVhdGVkIGEgcm90YXRpb25hbCB0d2VlbiBwYXJ0LXdheSB0aHJvdWdoIGFuIHgveSB0d2Vlbi4gTWFuYWdpbmcgdGhlIG9mZnNldCBpbiBhIHNlcGFyYXRlIHZhcmlhYmxlIGdpdmVzIHVzIHVsdGltYXRlIGZsZXhpYmlsaXR5LlxuXHRcdFx0XHRcdFx0Ly90bS54IC09IHggLSAoeCAqIG1bMF0gKyB5ICogbVsyXSk7XG5cdFx0XHRcdFx0XHQvL3RtLnkgLT0geSAtICh4ICogbVsxXSArIHkgKiBtWzNdKTtcblx0XHRcdFx0XHRcdHRtLnhPZmZzZXQgKz0gKHggKiBtWzBdICsgeSAqIG1bMl0pIC0geDtcblx0XHRcdFx0XHRcdHRtLnlPZmZzZXQgKz0gKHggKiBtWzFdICsgeSAqIG1bM10pIC0geTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dG0ueE9mZnNldCA9IHRtLnlPZmZzZXQgPSAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRlLnNldEF0dHJpYnV0ZShcImRhdGEtc3ZnLW9yaWdpblwiLCB2LmpvaW4oXCIgXCIpKTtcblx0XHRcdH0sXG5cdFx0XHRfaXNTVkcgPSBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdHJldHVybiAhIShfU1ZHRWxlbWVudCAmJiB0eXBlb2YoZS5nZXRCQm94KSA9PT0gXCJmdW5jdGlvblwiICYmIGUuZ2V0Q1RNICYmICghZS5wYXJlbnROb2RlIHx8IChlLnBhcmVudE5vZGUuZ2V0QkJveCAmJiBlLnBhcmVudE5vZGUuZ2V0Q1RNKSkpO1xuXHRcdFx0fSxcblx0XHRcdF9pZGVudGl0eTJETWF0cml4ID0gWzEsMCwwLDEsMCwwXSxcblx0XHRcdF9nZXRNYXRyaXggPSBmdW5jdGlvbihlLCBmb3JjZTJEKSB7XG5cdFx0XHRcdHZhciB0bSA9IGUuX2dzVHJhbnNmb3JtIHx8IG5ldyBUcmFuc2Zvcm0oKSxcblx0XHRcdFx0XHRybmQgPSAxMDAwMDAsXG5cdFx0XHRcdFx0aXNEZWZhdWx0LCBzLCBtLCBuLCBkZWM7XG5cdFx0XHRcdGlmIChfdHJhbnNmb3JtUHJvcCkge1xuXHRcdFx0XHRcdHMgPSBfZ2V0U3R5bGUoZSwgX3RyYW5zZm9ybVByb3BDU1MsIG51bGwsIHRydWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGUuY3VycmVudFN0eWxlKSB7XG5cdFx0XHRcdFx0Ly9mb3Igb2xkZXIgdmVyc2lvbnMgb2YgSUUsIHdlIG5lZWQgdG8gaW50ZXJwcmV0IHRoZSBmaWx0ZXIgcG9ydGlvbiB0aGF0IGlzIGluIHRoZSBmb3JtYXQ6IHByb2dpZDpEWEltYWdlVHJhbnNmb3JtLk1pY3Jvc29mdC5NYXRyaXgoTTExPTYuMTIzMjMzOTk1NzM2NzY2ZS0xNywgTTEyPS0xLCBNMjE9MSwgTTIyPTYuMTIzMjMzOTk1NzM2NzY2ZS0xNywgc2l6aW5nTWV0aG9kPSdhdXRvIGV4cGFuZCcpIE5vdGljZSB0aGF0IHdlIG5lZWQgdG8gc3dhcCBiIGFuZCBjIGNvbXBhcmVkIHRvIGEgbm9ybWFsIG1hdHJpeC5cblx0XHRcdFx0XHRzID0gZS5jdXJyZW50U3R5bGUuZmlsdGVyLm1hdGNoKF9pZUdldE1hdHJpeEV4cCk7XG5cdFx0XHRcdFx0cyA9IChzICYmIHMubGVuZ3RoID09PSA0KSA/IFtzWzBdLnN1YnN0cig0KSwgTnVtYmVyKHNbMl0uc3Vic3RyKDQpKSwgTnVtYmVyKHNbMV0uc3Vic3RyKDQpKSwgc1szXS5zdWJzdHIoNCksICh0bS54IHx8IDApLCAodG0ueSB8fCAwKV0uam9pbihcIixcIikgOiBcIlwiO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlzRGVmYXVsdCA9ICghcyB8fCBzID09PSBcIm5vbmVcIiB8fCBzID09PSBcIm1hdHJpeCgxLCAwLCAwLCAxLCAwLCAwKVwiKTtcblx0XHRcdFx0aWYgKHRtLnN2ZyB8fCAoZS5nZXRCQm94ICYmIF9pc1NWRyhlKSkpIHtcblx0XHRcdFx0XHRpZiAoaXNEZWZhdWx0ICYmIChlLnN0eWxlW190cmFuc2Zvcm1Qcm9wXSArIFwiXCIpLmluZGV4T2YoXCJtYXRyaXhcIikgIT09IC0xKSB7IC8vc29tZSBicm93c2VycyAobGlrZSBDaHJvbWUgNDApIGRvbid0IGNvcnJlY3RseSByZXBvcnQgdHJhbnNmb3JtcyB0aGF0IGFyZSBhcHBsaWVkIGlubGluZSBvbiBhbiBTVkcgZWxlbWVudCAodGhleSBkb24ndCBnZXQgaW5jbHVkZWQgaW4gdGhlIGNvbXB1dGVkIHN0eWxlKSwgc28gd2UgZG91YmxlLWNoZWNrIGhlcmUgYW5kIGFjY2VwdCBtYXRyaXggdmFsdWVzXG5cdFx0XHRcdFx0XHRzID0gZS5zdHlsZVtfdHJhbnNmb3JtUHJvcF07XG5cdFx0XHRcdFx0XHRpc0RlZmF1bHQgPSAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtID0gZS5nZXRBdHRyaWJ1dGUoXCJ0cmFuc2Zvcm1cIik7XG5cdFx0XHRcdFx0aWYgKGlzRGVmYXVsdCAmJiBtKSB7XG5cdFx0XHRcdFx0XHRpZiAobS5pbmRleE9mKFwibWF0cml4XCIpICE9PSAtMSkgeyAvL2p1c3QgaW4gY2FzZSB0aGVyZSdzIGEgXCJ0cmFuc2Zvcm1cIiB2YWx1ZSBzcGVjaWZpZWQgYXMgYW4gYXR0cmlidXRlIGluc3RlYWQgb2YgQ1NTIHN0eWxlLiBBY2NlcHQgZWl0aGVyIGEgbWF0cml4KCkgb3Igc2ltcGxlIHRyYW5zbGF0ZSgpIHZhbHVlIHRob3VnaC5cblx0XHRcdFx0XHRcdFx0cyA9IG07XG5cdFx0XHRcdFx0XHRcdGlzRGVmYXVsdCA9IDA7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKG0uaW5kZXhPZihcInRyYW5zbGF0ZVwiKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0cyA9IFwibWF0cml4KDEsMCwwLDEsXCIgKyBtLm1hdGNoKC8oPzpcXC18XFxiKVtcXGRcXC1cXC5lXStcXGIvZ2kpLmpvaW4oXCIsXCIpICsgXCIpXCI7XG5cdFx0XHRcdFx0XHRcdGlzRGVmYXVsdCA9IDA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc0RlZmF1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gX2lkZW50aXR5MkRNYXRyaXg7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly9zcGxpdCB0aGUgbWF0cml4IHZhbHVlcyBvdXQgaW50byBhbiBhcnJheSAobSBmb3IgbWF0cml4KVxuXHRcdFx0XHRtID0gKHMgfHwgXCJcIikubWF0Y2goLyg/OlxcLXxcXGIpW1xcZFxcLVxcLmVdK1xcYi9naSkgfHwgW107XG5cdFx0XHRcdGkgPSBtLmxlbmd0aDtcblx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0biA9IE51bWJlcihtW2ldKTtcblx0XHRcdFx0XHRtW2ldID0gKGRlYyA9IG4gLSAobiB8PSAwKSkgPyAoKGRlYyAqIHJuZCArIChkZWMgPCAwID8gLTAuNSA6IDAuNSkpIHwgMCkgLyBybmQgKyBuIDogbjsgLy9jb252ZXJ0IHN0cmluZ3MgdG8gTnVtYmVycyBhbmQgcm91bmQgdG8gNSBkZWNpbWFsIHBsYWNlcyB0byBhdm9pZCBpc3N1ZXMgd2l0aCB0aW55IG51bWJlcnMuIFJvdWdobHkgMjB4IGZhc3RlciB0aGFuIE51bWJlci50b0ZpeGVkKCkuIFdlIGFsc28gbXVzdCBtYWtlIHN1cmUgdG8gcm91bmQgYmVmb3JlIGRpdmlkaW5nIHNvIHRoYXQgdmFsdWVzIGxpa2UgMC45OTk5OTk5OTk5IGJlY29tZSAxIHRvIGF2b2lkIGdsaXRjaGVzIGluIGJyb3dzZXIgcmVuZGVyaW5nIGFuZCBpbnRlcnByZXRhdGlvbiBvZiBmbGlwcGVkL3JvdGF0ZWQgM0QgbWF0cmljZXMuIEFuZCBkb24ndCBqdXN0IG11bHRpcGx5IHRoZSBudW1iZXIgYnkgcm5kLCBmbG9vciBpdCwgYW5kIHRoZW4gZGl2aWRlIGJ5IHJuZCBiZWNhdXNlIHRoZSBiaXR3aXNlIG9wZXJhdGlvbnMgbWF4IG91dCBhdCBhIDMyLWJpdCBzaWduZWQgaW50ZWdlciwgdGh1cyBpdCBjb3VsZCBnZXQgY2xpcHBlZCBhdCBhIHJlbGF0aXZlbHkgbG93IHZhbHVlIChsaWtlIDIyLDAwMC4wMDAwMCBmb3IgZXhhbXBsZSkuXG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIChmb3JjZTJEICYmIG0ubGVuZ3RoID4gNikgPyBbbVswXSwgbVsxXSwgbVs0XSwgbVs1XSwgbVsxMl0sIG1bMTNdXSA6IG07XG5cdFx0XHR9LFxuXG5cdFx0XHQvKipcblx0XHRcdCAqIFBhcnNlcyB0aGUgdHJhbnNmb3JtIHZhbHVlcyBmb3IgYW4gZWxlbWVudCwgcmV0dXJuaW5nIGFuIG9iamVjdCB3aXRoIHgsIHksIHosIHNjYWxlWCwgc2NhbGVZLCBzY2FsZVosIHJvdGF0aW9uLCByb3RhdGlvblgsIHJvdGF0aW9uWSwgc2tld1gsIGFuZCBza2V3WSBwcm9wZXJ0aWVzLiBOb3RlOiBieSBkZWZhdWx0IChmb3IgcGVyZm9ybWFuY2UgcmVhc29ucyksIGFsbCBza2V3aW5nIGlzIGNvbWJpbmVkIGludG8gc2tld1ggYW5kIHJvdGF0aW9uIGJ1dCBza2V3WSBzdGlsbCBoYXMgYSBwbGFjZSBpbiB0aGUgdHJhbnNmb3JtIG9iamVjdCBzbyB0aGF0IHdlIGNhbiByZWNvcmQgaG93IG11Y2ggb2YgdGhlIHNrZXcgaXMgYXR0cmlidXRlZCB0byBza2V3WCB2cyBza2V3WS4gUmVtZW1iZXIsIGEgc2tld1kgb2YgMTAgbG9va3MgdGhlIHNhbWUgYXMgYSByb3RhdGlvbiBvZiAxMCBhbmQgc2tld1ggb2YgLTEwLlxuXHRcdFx0ICogQHBhcmFtIHshT2JqZWN0fSB0IHRhcmdldCBlbGVtZW50XG5cdFx0XHQgKiBAcGFyYW0ge09iamVjdD19IGNzIGNvbXB1dGVkIHN0eWxlIG9iamVjdCAob3B0aW9uYWwpXG5cdFx0XHQgKiBAcGFyYW0ge2Jvb2xlYW49fSByZWMgaWYgdHJ1ZSwgdGhlIHRyYW5zZm9ybSB2YWx1ZXMgd2lsbCBiZSByZWNvcmRlZCB0byB0aGUgdGFyZ2V0IGVsZW1lbnQncyBfZ3NUcmFuc2Zvcm0gb2JqZWN0LCBsaWtlIHRhcmdldC5fZ3NUcmFuc2Zvcm0gPSB7eDowLCB5OjAsIHo6MCwgc2NhbGVYOjEuLi59XG5cdFx0XHQgKiBAcGFyYW0ge2Jvb2xlYW49fSBwYXJzZSBpZiB0cnVlLCB3ZSdsbCBpZ25vcmUgYW55IF9nc1RyYW5zZm9ybSB2YWx1ZXMgdGhhdCBhbHJlYWR5IGV4aXN0IG9uIHRoZSBlbGVtZW50LCBhbmQgZm9yY2UgYSByZXBhcnNpbmcgb2YgdGhlIGNzcyAoY2FsY3VsYXRlZCBzdHlsZSlcblx0XHRcdCAqIEByZXR1cm4ge29iamVjdH0gb2JqZWN0IGNvbnRhaW5pbmcgYWxsIG9mIHRoZSB0cmFuc2Zvcm0gcHJvcGVydGllcy92YWx1ZXMgbGlrZSB7eDowLCB5OjAsIHo6MCwgc2NhbGVYOjEuLi59XG5cdFx0XHQgKi9cblx0XHRcdF9nZXRUcmFuc2Zvcm0gPSBfaW50ZXJuYWxzLmdldFRyYW5zZm9ybSA9IGZ1bmN0aW9uKHQsIGNzLCByZWMsIHBhcnNlKSB7XG5cdFx0XHRcdGlmICh0Ll9nc1RyYW5zZm9ybSAmJiByZWMgJiYgIXBhcnNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHQuX2dzVHJhbnNmb3JtOyAvL2lmIHRoZSBlbGVtZW50IGFscmVhZHkgaGFzIGEgX2dzVHJhbnNmb3JtLCB1c2UgdGhhdC4gTm90ZTogc29tZSBicm93c2VycyBkb24ndCBhY2N1cmF0ZWx5IHJldHVybiB0aGUgY2FsY3VsYXRlZCBzdHlsZSBmb3IgdGhlIHRyYW5zZm9ybSAocGFydGljdWxhcmx5IGZvciBTVkcpLCBzbyBpdCdzIGFsbW9zdCBhbHdheXMgc2FmZXN0IHRvIGp1c3QgdXNlIHRoZSB2YWx1ZXMgd2UndmUgYWxyZWFkeSBhcHBsaWVkIHJhdGhlciB0aGFuIHJlLXBhcnNpbmcgdGhpbmdzLlxuXHRcdFx0XHR9XG5cdFx0XHRcdHZhciB0bSA9IHJlYyA/IHQuX2dzVHJhbnNmb3JtIHx8IG5ldyBUcmFuc2Zvcm0oKSA6IG5ldyBUcmFuc2Zvcm0oKSxcblx0XHRcdFx0XHRpbnZYID0gKHRtLnNjYWxlWCA8IDApLCAvL2luIG9yZGVyIHRvIGludGVycHJldCB0aGluZ3MgcHJvcGVybHksIHdlIG5lZWQgdG8ga25vdyBpZiB0aGUgdXNlciBhcHBsaWVkIGEgbmVnYXRpdmUgc2NhbGVYIHByZXZpb3VzbHkgc28gdGhhdCB3ZSBjYW4gYWRqdXN0IHRoZSByb3RhdGlvbiBhbmQgc2tld1ggYWNjb3JkaW5nbHkuIE90aGVyd2lzZSwgaWYgd2UgYWx3YXlzIGludGVycHJldCBhIGZsaXBwZWQgbWF0cml4IGFzIGFmZmVjdGluZyBzY2FsZVkgYW5kIHRoZSB1c2VyIG9ubHkgd2FudHMgdG8gdHdlZW4gdGhlIHNjYWxlWCBvbiBtdWx0aXBsZSBzZXF1ZW50aWFsIHR3ZWVucywgaXQgd291bGQga2VlcCB0aGUgbmVnYXRpdmUgc2NhbGVZIHdpdGhvdXQgdGhhdCBiZWluZyB0aGUgdXNlcidzIGludGVudC5cblx0XHRcdFx0XHRtaW4gPSAwLjAwMDAyLFxuXHRcdFx0XHRcdHJuZCA9IDEwMDAwMCxcblx0XHRcdFx0XHR6T3JpZ2luID0gX3N1cHBvcnRzM0QgPyBwYXJzZUZsb2F0KF9nZXRTdHlsZSh0LCBfdHJhbnNmb3JtT3JpZ2luUHJvcCwgY3MsIGZhbHNlLCBcIjAgMCAwXCIpLnNwbGl0KFwiIFwiKVsyXSkgfHwgdG0uek9yaWdpbiAgfHwgMCA6IDAsXG5cdFx0XHRcdFx0ZGVmYXVsdFRyYW5zZm9ybVBlcnNwZWN0aXZlID0gcGFyc2VGbG9hdChDU1NQbHVnaW4uZGVmYXVsdFRyYW5zZm9ybVBlcnNwZWN0aXZlKSB8fCAwLFxuXHRcdFx0XHRcdG0sIGksIHNjYWxlWCwgc2NhbGVZLCByb3RhdGlvbiwgc2tld1g7XG5cblx0XHRcdFx0dG0uc3ZnID0gISEodC5nZXRCQm94ICYmIF9pc1NWRyh0KSk7XG5cdFx0XHRcdGlmICh0bS5zdmcpIHtcblx0XHRcdFx0XHRfcGFyc2VTVkdPcmlnaW4odCwgX2dldFN0eWxlKHQsIF90cmFuc2Zvcm1PcmlnaW5Qcm9wLCBfY3MsIGZhbHNlLCBcIjUwJSA1MCVcIikgKyBcIlwiLCB0bSwgdC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXN2Zy1vcmlnaW5cIikpO1xuXHRcdFx0XHRcdF91c2VTVkdUcmFuc2Zvcm1BdHRyID0gQ1NTUGx1Z2luLnVzZVNWR1RyYW5zZm9ybUF0dHIgfHwgX2ZvcmNlU1ZHVHJhbnNmb3JtQXR0cjtcblx0XHRcdFx0fVxuXHRcdFx0XHRtID0gX2dldE1hdHJpeCh0KTtcblx0XHRcdFx0aWYgKG0gIT09IF9pZGVudGl0eTJETWF0cml4KSB7XG5cblx0XHRcdFx0XHRpZiAobS5sZW5ndGggPT09IDE2KSB7XG5cdFx0XHRcdFx0XHQvL3dlJ2xsIG9ubHkgbG9vayBhdCB0aGVzZSBwb3NpdGlvbi1yZWxhdGVkIDYgdmFyaWFibGVzIGZpcnN0IGJlY2F1c2UgaWYgeC95L3ogYWxsIG1hdGNoLCBpdCdzIHJlbGF0aXZlbHkgc2FmZSB0byBhc3N1bWUgd2UgZG9uJ3QgbmVlZCB0byByZS1wYXJzZSBldmVyeXRoaW5nIHdoaWNoIHJpc2tzIGxvc2luZyBpbXBvcnRhbnQgcm90YXRpb25hbCBpbmZvcm1hdGlvbiAobGlrZSByb3RhdGlvblg6MTgwIHBsdXMgcm90YXRpb25ZOjE4MCB3b3VsZCBsb29rIHRoZSBzYW1lIGFzIHJvdGF0aW9uOjE4MCAtIHRoZXJlJ3Mgbm8gd2F5IHRvIGtub3cgZm9yIHN1cmUgd2hpY2ggZGlyZWN0aW9uIHdhcyB0YWtlbiBiYXNlZCBzb2xlbHkgb24gdGhlIG1hdHJpeDNkKCkgdmFsdWVzKVxuXHRcdFx0XHRcdFx0dmFyIGExMSA9IG1bMF0sIGEyMSA9IG1bMV0sIGEzMSA9IG1bMl0sIGE0MSA9IG1bM10sXG5cdFx0XHRcdFx0XHRcdGExMiA9IG1bNF0sIGEyMiA9IG1bNV0sIGEzMiA9IG1bNl0sIGE0MiA9IG1bN10sXG5cdFx0XHRcdFx0XHRcdGExMyA9IG1bOF0sIGEyMyA9IG1bOV0sIGEzMyA9IG1bMTBdLFxuXHRcdFx0XHRcdFx0XHRhMTQgPSBtWzEyXSwgYTI0ID0gbVsxM10sIGEzNCA9IG1bMTRdLFxuXHRcdFx0XHRcdFx0XHRhNDMgPSBtWzExXSxcblx0XHRcdFx0XHRcdFx0YW5nbGUgPSBNYXRoLmF0YW4yKGEzMiwgYTMzKSxcblx0XHRcdFx0XHRcdFx0dDEsIHQyLCB0MywgdDQsIGNvcywgc2luO1xuXG5cdFx0XHRcdFx0XHQvL3dlIG1hbnVhbGx5IGNvbXBlbnNhdGUgZm9yIG5vbi16ZXJvIHogY29tcG9uZW50IG9mIHRyYW5zZm9ybU9yaWdpbiB0byB3b3JrIGFyb3VuZCBidWdzIGluIFNhZmFyaVxuXHRcdFx0XHRcdFx0aWYgKHRtLnpPcmlnaW4pIHtcblx0XHRcdFx0XHRcdFx0YTM0ID0gLXRtLnpPcmlnaW47XG5cdFx0XHRcdFx0XHRcdGExNCA9IGExMyphMzQtbVsxMl07XG5cdFx0XHRcdFx0XHRcdGEyNCA9IGEyMyphMzQtbVsxM107XG5cdFx0XHRcdFx0XHRcdGEzNCA9IGEzMyphMzQrdG0uek9yaWdpbi1tWzE0XTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRtLnJvdGF0aW9uWCA9IGFuZ2xlICogX1JBRDJERUc7XG5cdFx0XHRcdFx0XHQvL3JvdGF0aW9uWFxuXHRcdFx0XHRcdFx0aWYgKGFuZ2xlKSB7XG5cdFx0XHRcdFx0XHRcdGNvcyA9IE1hdGguY29zKC1hbmdsZSk7XG5cdFx0XHRcdFx0XHRcdHNpbiA9IE1hdGguc2luKC1hbmdsZSk7XG5cdFx0XHRcdFx0XHRcdHQxID0gYTEyKmNvcythMTMqc2luO1xuXHRcdFx0XHRcdFx0XHR0MiA9IGEyMipjb3MrYTIzKnNpbjtcblx0XHRcdFx0XHRcdFx0dDMgPSBhMzIqY29zK2EzMypzaW47XG5cdFx0XHRcdFx0XHRcdGExMyA9IGExMiotc2luK2ExMypjb3M7XG5cdFx0XHRcdFx0XHRcdGEyMyA9IGEyMiotc2luK2EyMypjb3M7XG5cdFx0XHRcdFx0XHRcdGEzMyA9IGEzMiotc2luK2EzMypjb3M7XG5cdFx0XHRcdFx0XHRcdGE0MyA9IGE0Miotc2luK2E0Mypjb3M7XG5cdFx0XHRcdFx0XHRcdGExMiA9IHQxO1xuXHRcdFx0XHRcdFx0XHRhMjIgPSB0Mjtcblx0XHRcdFx0XHRcdFx0YTMyID0gdDM7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvL3JvdGF0aW9uWVxuXHRcdFx0XHRcdFx0YW5nbGUgPSBNYXRoLmF0YW4yKGExMywgYTMzKTtcblx0XHRcdFx0XHRcdHRtLnJvdGF0aW9uWSA9IGFuZ2xlICogX1JBRDJERUc7XG5cdFx0XHRcdFx0XHRpZiAoYW5nbGUpIHtcblx0XHRcdFx0XHRcdFx0Y29zID0gTWF0aC5jb3MoLWFuZ2xlKTtcblx0XHRcdFx0XHRcdFx0c2luID0gTWF0aC5zaW4oLWFuZ2xlKTtcblx0XHRcdFx0XHRcdFx0dDEgPSBhMTEqY29zLWExMypzaW47XG5cdFx0XHRcdFx0XHRcdHQyID0gYTIxKmNvcy1hMjMqc2luO1xuXHRcdFx0XHRcdFx0XHR0MyA9IGEzMSpjb3MtYTMzKnNpbjtcblx0XHRcdFx0XHRcdFx0YTIzID0gYTIxKnNpbithMjMqY29zO1xuXHRcdFx0XHRcdFx0XHRhMzMgPSBhMzEqc2luK2EzMypjb3M7XG5cdFx0XHRcdFx0XHRcdGE0MyA9IGE0MSpzaW4rYTQzKmNvcztcblx0XHRcdFx0XHRcdFx0YTExID0gdDE7XG5cdFx0XHRcdFx0XHRcdGEyMSA9IHQyO1xuXHRcdFx0XHRcdFx0XHRhMzEgPSB0Mztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vcm90YXRpb25aXG5cdFx0XHRcdFx0XHRhbmdsZSA9IE1hdGguYXRhbjIoYTIxLCBhMTEpO1xuXHRcdFx0XHRcdFx0dG0ucm90YXRpb24gPSBhbmdsZSAqIF9SQUQyREVHO1xuXHRcdFx0XHRcdFx0aWYgKGFuZ2xlKSB7XG5cdFx0XHRcdFx0XHRcdGNvcyA9IE1hdGguY29zKC1hbmdsZSk7XG5cdFx0XHRcdFx0XHRcdHNpbiA9IE1hdGguc2luKC1hbmdsZSk7XG5cdFx0XHRcdFx0XHRcdGExMSA9IGExMSpjb3MrYTEyKnNpbjtcblx0XHRcdFx0XHRcdFx0dDIgPSBhMjEqY29zK2EyMipzaW47XG5cdFx0XHRcdFx0XHRcdGEyMiA9IGEyMSotc2luK2EyMipjb3M7XG5cdFx0XHRcdFx0XHRcdGEzMiA9IGEzMSotc2luK2EzMipjb3M7XG5cdFx0XHRcdFx0XHRcdGEyMSA9IHQyO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAodG0ucm90YXRpb25YICYmIE1hdGguYWJzKHRtLnJvdGF0aW9uWCkgKyBNYXRoLmFicyh0bS5yb3RhdGlvbikgPiAzNTkuOSkgeyAvL3doZW4gcm90YXRpb25ZIGlzIHNldCwgaXQgd2lsbCBvZnRlbiBiZSBwYXJzZWQgYXMgMTgwIGRlZ3JlZXMgZGlmZmVyZW50IHRoYW4gaXQgc2hvdWxkIGJlLCBhbmQgcm90YXRpb25YIGFuZCByb3RhdGlvbiBib3RoIGJlaW5nIDE4MCAoaXQgbG9va3MgdGhlIHNhbWUpLCBzbyB3ZSBhZGp1c3QgZm9yIHRoYXQgaGVyZS5cblx0XHRcdFx0XHRcdFx0dG0ucm90YXRpb25YID0gdG0ucm90YXRpb24gPSAwO1xuXHRcdFx0XHRcdFx0XHR0bS5yb3RhdGlvblkgKz0gMTgwO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0bS5zY2FsZVggPSAoKE1hdGguc3FydChhMTEgKiBhMTEgKyBhMjEgKiBhMjEpICogcm5kICsgMC41KSB8IDApIC8gcm5kO1xuXHRcdFx0XHRcdFx0dG0uc2NhbGVZID0gKChNYXRoLnNxcnQoYTIyICogYTIyICsgYTIzICogYTIzKSAqIHJuZCArIDAuNSkgfCAwKSAvIHJuZDtcblx0XHRcdFx0XHRcdHRtLnNjYWxlWiA9ICgoTWF0aC5zcXJ0KGEzMiAqIGEzMiArIGEzMyAqIGEzMykgKiBybmQgKyAwLjUpIHwgMCkgLyBybmQ7XG5cdFx0XHRcdFx0XHR0bS5za2V3WCA9IDA7XG5cdFx0XHRcdFx0XHR0bS5wZXJzcGVjdGl2ZSA9IGE0MyA/IDEgLyAoKGE0MyA8IDApID8gLWE0MyA6IGE0MykgOiAwO1xuXHRcdFx0XHRcdFx0dG0ueCA9IGExNDtcblx0XHRcdFx0XHRcdHRtLnkgPSBhMjQ7XG5cdFx0XHRcdFx0XHR0bS56ID0gYTM0O1xuXHRcdFx0XHRcdFx0aWYgKHRtLnN2Zykge1xuXHRcdFx0XHRcdFx0XHR0bS54IC09IHRtLnhPcmlnaW4gLSAodG0ueE9yaWdpbiAqIGExMSAtIHRtLnlPcmlnaW4gKiBhMTIpO1xuXHRcdFx0XHRcdFx0XHR0bS55IC09IHRtLnlPcmlnaW4gLSAodG0ueU9yaWdpbiAqIGEyMSAtIHRtLnhPcmlnaW4gKiBhMjIpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0fSBlbHNlIGlmICgoIV9zdXBwb3J0czNEIHx8IHBhcnNlIHx8ICFtLmxlbmd0aCB8fCB0bS54ICE9PSBtWzRdIHx8IHRtLnkgIT09IG1bNV0gfHwgKCF0bS5yb3RhdGlvblggJiYgIXRtLnJvdGF0aW9uWSkpICYmICEodG0ueCAhPT0gdW5kZWZpbmVkICYmIF9nZXRTdHlsZSh0LCBcImRpc3BsYXlcIiwgY3MpID09PSBcIm5vbmVcIikpIHsgLy9zb21ldGltZXMgYSA2LWVsZW1lbnQgbWF0cml4IGlzIHJldHVybmVkIGV2ZW4gd2hlbiB3ZSBwZXJmb3JtZWQgM0QgdHJhbnNmb3JtcywgbGlrZSBpZiByb3RhdGlvblggYW5kIHJvdGF0aW9uWSBhcmUgMTgwLiBJbiBjYXNlcyBsaWtlIHRoaXMsIHdlIHN0aWxsIG5lZWQgdG8gaG9ub3IgdGhlIDNEIHRyYW5zZm9ybXMuIElmIHdlIGp1c3QgcmVseSBvbiB0aGUgMkQgaW5mbywgaXQgY291bGQgYWZmZWN0IGhvdyB0aGUgZGF0YSBpcyBpbnRlcnByZXRlZCwgbGlrZSBzY2FsZVkgbWlnaHQgZ2V0IHNldCB0byAtMSBvciByb3RhdGlvbiBjb3VsZCBnZXQgb2Zmc2V0IGJ5IDE4MCBkZWdyZWVzLiBGb3IgZXhhbXBsZSwgZG8gYSBUd2VlbkxpdGUudG8oZWxlbWVudCwgMSwge2Nzczp7cm90YXRpb25YOjE4MCwgcm90YXRpb25ZOjE4MH19KSBhbmQgdGhlbiBsYXRlciwgVHdlZW5MaXRlLnRvKGVsZW1lbnQsIDEsIHtjc3M6e3JvdGF0aW9uWDowfX0pIGFuZCB3aXRob3V0IHRoaXMgY29uZGl0aW9uYWwgbG9naWMgaW4gcGxhY2UsIGl0J2QganVtcCB0byBhIHN0YXRlIG9mIGJlaW5nIHVucm90YXRlZCB3aGVuIHRoZSAybmQgdHdlZW4gc3RhcnRzLiBUaGVuIGFnYWluLCB3ZSBuZWVkIHRvIGhvbm9yIHRoZSBmYWN0IHRoYXQgdGhlIHVzZXIgQ09VTEQgYWx0ZXIgdGhlIHRyYW5zZm9ybXMgb3V0c2lkZSBvZiBDU1NQbHVnaW4sIGxpa2UgYnkgbWFudWFsbHkgYXBwbHlpbmcgbmV3IGNzcywgc28gd2UgdHJ5IHRvIHNlbnNlIHRoYXQgYnkgbG9va2luZyBhdCB4IGFuZCB5IGJlY2F1c2UgaWYgdGhvc2UgY2hhbmdlZCwgd2Uga25vdyB0aGUgY2hhbmdlcyB3ZXJlIG1hZGUgb3V0c2lkZSBDU1NQbHVnaW4gYW5kIHdlIGZvcmNlIGEgcmVpbnRlcnByZXRhdGlvbiBvZiB0aGUgbWF0cml4IHZhbHVlcy4gQWxzbywgaW4gV2Via2l0IGJyb3dzZXJzLCBpZiB0aGUgZWxlbWVudCdzIFwiZGlzcGxheVwiIGlzIFwibm9uZVwiLCBpdHMgY2FsY3VsYXRlZCBzdHlsZSB2YWx1ZSB3aWxsIGFsd2F5cyByZXR1cm4gZW1wdHksIHNvIGlmIHdlJ3ZlIGFscmVhZHkgcmVjb3JkZWQgdGhlIHZhbHVlcyBpbiB0aGUgX2dzVHJhbnNmb3JtIG9iamVjdCwgd2UnbGwganVzdCByZWx5IG9uIHRob3NlLlxuXHRcdFx0XHRcdFx0dmFyIGsgPSAobS5sZW5ndGggPj0gNiksXG5cdFx0XHRcdFx0XHRcdGEgPSBrID8gbVswXSA6IDEsXG5cdFx0XHRcdFx0XHRcdGIgPSBtWzFdIHx8IDAsXG5cdFx0XHRcdFx0XHRcdGMgPSBtWzJdIHx8IDAsXG5cdFx0XHRcdFx0XHRcdGQgPSBrID8gbVszXSA6IDE7XG5cdFx0XHRcdFx0XHR0bS54ID0gbVs0XSB8fCAwO1xuXHRcdFx0XHRcdFx0dG0ueSA9IG1bNV0gfHwgMDtcblx0XHRcdFx0XHRcdHNjYWxlWCA9IE1hdGguc3FydChhICogYSArIGIgKiBiKTtcblx0XHRcdFx0XHRcdHNjYWxlWSA9IE1hdGguc3FydChkICogZCArIGMgKiBjKTtcblx0XHRcdFx0XHRcdHJvdGF0aW9uID0gKGEgfHwgYikgPyBNYXRoLmF0YW4yKGIsIGEpICogX1JBRDJERUcgOiB0bS5yb3RhdGlvbiB8fCAwOyAvL25vdGU6IGlmIHNjYWxlWCBpcyAwLCB3ZSBjYW5ub3QgYWNjdXJhdGVseSBtZWFzdXJlIHJvdGF0aW9uLiBTYW1lIGZvciBza2V3WCB3aXRoIGEgc2NhbGVZIG9mIDAuIFRoZXJlZm9yZSwgd2UgZGVmYXVsdCB0byB0aGUgcHJldmlvdXNseSByZWNvcmRlZCB2YWx1ZSAob3IgemVybyBpZiB0aGF0IGRvZXNuJ3QgZXhpc3QpLlxuXHRcdFx0XHRcdFx0c2tld1ggPSAoYyB8fCBkKSA/IE1hdGguYXRhbjIoYywgZCkgKiBfUkFEMkRFRyArIHJvdGF0aW9uIDogdG0uc2tld1ggfHwgMDtcblx0XHRcdFx0XHRcdGlmIChNYXRoLmFicyhza2V3WCkgPiA5MCAmJiBNYXRoLmFicyhza2V3WCkgPCAyNzApIHtcblx0XHRcdFx0XHRcdFx0aWYgKGludlgpIHtcblx0XHRcdFx0XHRcdFx0XHRzY2FsZVggKj0gLTE7XG5cdFx0XHRcdFx0XHRcdFx0c2tld1ggKz0gKHJvdGF0aW9uIDw9IDApID8gMTgwIDogLTE4MDtcblx0XHRcdFx0XHRcdFx0XHRyb3RhdGlvbiArPSAocm90YXRpb24gPD0gMCkgPyAxODAgOiAtMTgwO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHNjYWxlWSAqPSAtMTtcblx0XHRcdFx0XHRcdFx0XHRza2V3WCArPSAoc2tld1ggPD0gMCkgPyAxODAgOiAtMTgwO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0bS5zY2FsZVggPSBzY2FsZVg7XG5cdFx0XHRcdFx0XHR0bS5zY2FsZVkgPSBzY2FsZVk7XG5cdFx0XHRcdFx0XHR0bS5yb3RhdGlvbiA9IHJvdGF0aW9uO1xuXHRcdFx0XHRcdFx0dG0uc2tld1ggPSBza2V3WDtcblx0XHRcdFx0XHRcdGlmIChfc3VwcG9ydHMzRCkge1xuXHRcdFx0XHRcdFx0XHR0bS5yb3RhdGlvblggPSB0bS5yb3RhdGlvblkgPSB0bS56ID0gMDtcblx0XHRcdFx0XHRcdFx0dG0ucGVyc3BlY3RpdmUgPSBkZWZhdWx0VHJhbnNmb3JtUGVyc3BlY3RpdmU7XG5cdFx0XHRcdFx0XHRcdHRtLnNjYWxlWiA9IDE7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodG0uc3ZnKSB7XG5cdFx0XHRcdFx0XHRcdHRtLnggLT0gdG0ueE9yaWdpbiAtICh0bS54T3JpZ2luICogYSArIHRtLnlPcmlnaW4gKiBjKTtcblx0XHRcdFx0XHRcdFx0dG0ueSAtPSB0bS55T3JpZ2luIC0gKHRtLnhPcmlnaW4gKiBiICsgdG0ueU9yaWdpbiAqIGQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0bS56T3JpZ2luID0gek9yaWdpbjtcblx0XHRcdFx0XHQvL3NvbWUgYnJvd3NlcnMgaGF2ZSBhIGhhcmQgdGltZSB3aXRoIHZlcnkgc21hbGwgdmFsdWVzIGxpa2UgMi40NDkyOTM1OTgyOTQ3MDY0ZS0xNiAobm90aWNlIHRoZSBcImUtXCIgdG93YXJkcyB0aGUgZW5kKSBhbmQgd291bGQgcmVuZGVyIHRoZSBvYmplY3Qgc2xpZ2h0bHkgb2ZmLiBTbyB3ZSByb3VuZCB0byAwIGluIHRoZXNlIGNhc2VzLiBUaGUgY29uZGl0aW9uYWwgbG9naWMgaGVyZSBpcyBmYXN0ZXIgdGhhbiBjYWxsaW5nIE1hdGguYWJzKCkuIEFsc28sIGJyb3dzZXJzIHRlbmQgdG8gcmVuZGVyIGEgU0xJR0hUTFkgcm90YXRlZCBvYmplY3QgaW4gYSBmdXp6eSB3YXksIHNvIHdlIG5lZWQgdG8gc25hcCB0byBleGFjdGx5IDAgd2hlbiBhcHByb3ByaWF0ZS5cblx0XHRcdFx0XHRmb3IgKGkgaW4gdG0pIHtcblx0XHRcdFx0XHRcdGlmICh0bVtpXSA8IG1pbikgaWYgKHRtW2ldID4gLW1pbikge1xuXHRcdFx0XHRcdFx0XHR0bVtpXSA9IDA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vREVCVUc6IF9sb2coXCJwYXJzZWQgcm90YXRpb24gb2YgXCIgKyB0LmdldEF0dHJpYnV0ZShcImlkXCIpK1wiOiBcIisodG0ucm90YXRpb25YKStcIiwgXCIrKHRtLnJvdGF0aW9uWSkrXCIsIFwiKyh0bS5yb3RhdGlvbikrXCIsIHNjYWxlOiBcIit0bS5zY2FsZVgrXCIsIFwiK3RtLnNjYWxlWStcIiwgXCIrdG0uc2NhbGVaK1wiLCBwb3NpdGlvbjogXCIrdG0ueCtcIiwgXCIrdG0ueStcIiwgXCIrdG0ueitcIiwgcGVyc3BlY3RpdmU6IFwiK3RtLnBlcnNwZWN0aXZlKyBcIiwgb3JpZ2luOiBcIisgdG0ueE9yaWdpbisgXCIsXCIrIHRtLnlPcmlnaW4pO1xuXHRcdFx0XHRpZiAocmVjKSB7XG5cdFx0XHRcdFx0dC5fZ3NUcmFuc2Zvcm0gPSB0bTsgLy9yZWNvcmQgdG8gdGhlIG9iamVjdCdzIF9nc1RyYW5zZm9ybSB3aGljaCB3ZSB1c2Ugc28gdGhhdCB0d2VlbnMgY2FuIGNvbnRyb2wgaW5kaXZpZHVhbCBwcm9wZXJ0aWVzIGluZGVwZW5kZW50bHkgKHdlIG5lZWQgYWxsIHRoZSBwcm9wZXJ0aWVzIHRvIGFjY3VyYXRlbHkgcmVjb21wb3NlIHRoZSBtYXRyaXggaW4gdGhlIHNldFJhdGlvKCkgbWV0aG9kKVxuXHRcdFx0XHRcdGlmICh0bS5zdmcpIHsgLy9pZiB3ZSdyZSBzdXBwb3NlZCB0byBhcHBseSB0cmFuc2Zvcm1zIHRvIHRoZSBTVkcgZWxlbWVudCdzIFwidHJhbnNmb3JtXCIgYXR0cmlidXRlLCBtYWtlIHN1cmUgdGhlcmUgYXJlbid0IGFueSBDU1MgdHJhbnNmb3JtcyBhcHBsaWVkIG9yIHRoZXknbGwgb3ZlcnJpZGUgdGhlIGF0dHJpYnV0ZSBvbmVzLiBBbHNvIGNsZWFyIHRoZSB0cmFuc2Zvcm0gYXR0cmlidXRlIGlmIHdlJ3JlIHVzaW5nIENTUywganVzdCB0byBiZSBjbGVhbi5cblx0XHRcdFx0XHRcdGlmIChfdXNlU1ZHVHJhbnNmb3JtQXR0ciAmJiB0LnN0eWxlW190cmFuc2Zvcm1Qcm9wXSkge1xuXHRcdFx0XHRcdFx0XHRUd2VlbkxpdGUuZGVsYXllZENhbGwoMC4wMDEsIGZ1bmN0aW9uKCl7IC8vaWYgd2UgYXBwbHkgdGhpcyByaWdodCBhd2F5IChiZWZvcmUgYW55dGhpbmcgaGFzIHJlbmRlcmVkKSwgd2UgcmlzayB0aGVyZSBiZWluZyBubyB0cmFuc2Zvcm1zIGZvciBhIGJyaWVmIG1vbWVudCBhbmQgaXQgYWxzbyBpbnRlcmZlcmVzIHdpdGggYWRqdXN0aW5nIHRoZSB0cmFuc2Zvcm1PcmlnaW4gaW4gYSB0d2VlbiB3aXRoIGltbWVkaWF0ZVJlbmRlcjp0cnVlIChpdCdkIHRyeSByZWFkaW5nIHRoZSBtYXRyaXggYW5kIGl0IHdvdWxkbid0IGhhdmUgdGhlIGFwcHJvcHJpYXRlIGRhdGEgaW4gcGxhY2UgYmVjYXVzZSB3ZSBqdXN0IHJlbW92ZWQgaXQpLlxuXHRcdFx0XHRcdFx0XHRcdF9yZW1vdmVQcm9wKHQuc3R5bGUsIF90cmFuc2Zvcm1Qcm9wKTtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKCFfdXNlU1ZHVHJhbnNmb3JtQXR0ciAmJiB0LmdldEF0dHJpYnV0ZShcInRyYW5zZm9ybVwiKSkge1xuXHRcdFx0XHRcdFx0XHRUd2VlbkxpdGUuZGVsYXllZENhbGwoMC4wMDEsIGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0XHRcdFx0dC5yZW1vdmVBdHRyaWJ1dGUoXCJ0cmFuc2Zvcm1cIik7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdG07XG5cdFx0XHR9LFxuXG5cdFx0XHQvL2ZvciBzZXR0aW5nIDJEIHRyYW5zZm9ybXMgaW4gSUU2LCBJRTcsIGFuZCBJRTggKG11c3QgdXNlIGEgXCJmaWx0ZXJcIiB0byBlbXVsYXRlIHRoZSBiZWhhdmlvciBvZiBtb2Rlcm4gZGF5IGJyb3dzZXIgdHJhbnNmb3Jtcylcblx0XHRcdF9zZXRJRVRyYW5zZm9ybVJhdGlvID0gZnVuY3Rpb24odikge1xuXHRcdFx0XHR2YXIgdCA9IHRoaXMuZGF0YSwgLy9yZWZlcnMgdG8gdGhlIGVsZW1lbnQncyBfZ3NUcmFuc2Zvcm0gb2JqZWN0XG5cdFx0XHRcdFx0YW5nID0gLXQucm90YXRpb24gKiBfREVHMlJBRCxcblx0XHRcdFx0XHRza2V3ID0gYW5nICsgdC5za2V3WCAqIF9ERUcyUkFELFxuXHRcdFx0XHRcdHJuZCA9IDEwMDAwMCxcblx0XHRcdFx0XHRhID0gKChNYXRoLmNvcyhhbmcpICogdC5zY2FsZVggKiBybmQpIHwgMCkgLyBybmQsXG5cdFx0XHRcdFx0YiA9ICgoTWF0aC5zaW4oYW5nKSAqIHQuc2NhbGVYICogcm5kKSB8IDApIC8gcm5kLFxuXHRcdFx0XHRcdGMgPSAoKE1hdGguc2luKHNrZXcpICogLXQuc2NhbGVZICogcm5kKSB8IDApIC8gcm5kLFxuXHRcdFx0XHRcdGQgPSAoKE1hdGguY29zKHNrZXcpICogdC5zY2FsZVkgKiBybmQpIHwgMCkgLyBybmQsXG5cdFx0XHRcdFx0c3R5bGUgPSB0aGlzLnQuc3R5bGUsXG5cdFx0XHRcdFx0Y3MgPSB0aGlzLnQuY3VycmVudFN0eWxlLFxuXHRcdFx0XHRcdGZpbHRlcnMsIHZhbDtcblx0XHRcdFx0aWYgKCFjcykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR2YWwgPSBiOyAvL2p1c3QgZm9yIHN3YXBwaW5nIHRoZSB2YXJpYWJsZXMgYW4gaW52ZXJ0aW5nIHRoZW0gKHJldXNlZCBcInZhbFwiIHRvIGF2b2lkIGNyZWF0aW5nIGFub3RoZXIgdmFyaWFibGUgaW4gbWVtb3J5KS4gSUUncyBmaWx0ZXIgbWF0cml4IHVzZXMgYSBub24tc3RhbmRhcmQgbWF0cml4IGNvbmZpZ3VyYXRpb24gKGFuZ2xlIGdvZXMgdGhlIG9wcG9zaXRlIHdheSwgYW5kIGIgYW5kIGMgYXJlIHJldmVyc2VkIGFuZCBpbnZlcnRlZClcblx0XHRcdFx0YiA9IC1jO1xuXHRcdFx0XHRjID0gLXZhbDtcblx0XHRcdFx0ZmlsdGVycyA9IGNzLmZpbHRlcjtcblx0XHRcdFx0c3R5bGUuZmlsdGVyID0gXCJcIjsgLy9yZW1vdmUgZmlsdGVycyBzbyB0aGF0IHdlIGNhbiBhY2N1cmF0ZWx5IG1lYXN1cmUgb2Zmc2V0V2lkdGgvb2Zmc2V0SGVpZ2h0XG5cdFx0XHRcdHZhciB3ID0gdGhpcy50Lm9mZnNldFdpZHRoLFxuXHRcdFx0XHRcdGggPSB0aGlzLnQub2Zmc2V0SGVpZ2h0LFxuXHRcdFx0XHRcdGNsaXAgPSAoY3MucG9zaXRpb24gIT09IFwiYWJzb2x1dGVcIiksXG5cdFx0XHRcdFx0bSA9IFwicHJvZ2lkOkRYSW1hZ2VUcmFuc2Zvcm0uTWljcm9zb2Z0Lk1hdHJpeChNMTE9XCIgKyBhICsgXCIsIE0xMj1cIiArIGIgKyBcIiwgTTIxPVwiICsgYyArIFwiLCBNMjI9XCIgKyBkLFxuXHRcdFx0XHRcdG94ID0gdC54ICsgKHcgKiB0LnhQZXJjZW50IC8gMTAwKSxcblx0XHRcdFx0XHRveSA9IHQueSArIChoICogdC55UGVyY2VudCAvIDEwMCksXG5cdFx0XHRcdFx0ZHgsIGR5O1xuXG5cdFx0XHRcdC8vaWYgdHJhbnNmb3JtT3JpZ2luIGlzIGJlaW5nIHVzZWQsIGFkanVzdCB0aGUgb2Zmc2V0IHggYW5kIHlcblx0XHRcdFx0aWYgKHQub3ggIT0gbnVsbCkge1xuXHRcdFx0XHRcdGR4ID0gKCh0Lm94cCkgPyB3ICogdC5veCAqIDAuMDEgOiB0Lm94KSAtIHcgLyAyO1xuXHRcdFx0XHRcdGR5ID0gKCh0Lm95cCkgPyBoICogdC5veSAqIDAuMDEgOiB0Lm95KSAtIGggLyAyO1xuXHRcdFx0XHRcdG94ICs9IGR4IC0gKGR4ICogYSArIGR5ICogYik7XG5cdFx0XHRcdFx0b3kgKz0gZHkgLSAoZHggKiBjICsgZHkgKiBkKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghY2xpcCkge1xuXHRcdFx0XHRcdG0gKz0gXCIsIHNpemluZ01ldGhvZD0nYXV0byBleHBhbmQnKVwiO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGR4ID0gKHcgLyAyKTtcblx0XHRcdFx0XHRkeSA9IChoIC8gMik7XG5cdFx0XHRcdFx0Ly90cmFuc2xhdGUgdG8gZW5zdXJlIHRoYXQgdHJhbnNmb3JtYXRpb25zIG9jY3VyIGFyb3VuZCB0aGUgY29ycmVjdCBvcmlnaW4gKGRlZmF1bHQgaXMgY2VudGVyKS5cblx0XHRcdFx0XHRtICs9IFwiLCBEeD1cIiArIChkeCAtIChkeCAqIGEgKyBkeSAqIGIpICsgb3gpICsgXCIsIER5PVwiICsgKGR5IC0gKGR4ICogYyArIGR5ICogZCkgKyBveSkgKyBcIilcIjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZmlsdGVycy5pbmRleE9mKFwiRFhJbWFnZVRyYW5zZm9ybS5NaWNyb3NvZnQuTWF0cml4KFwiKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRzdHlsZS5maWx0ZXIgPSBmaWx0ZXJzLnJlcGxhY2UoX2llU2V0TWF0cml4RXhwLCBtKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdHlsZS5maWx0ZXIgPSBtICsgXCIgXCIgKyBmaWx0ZXJzOyAvL3dlIG11c3QgYWx3YXlzIHB1dCB0aGUgdHJhbnNmb3JtL21hdHJpeCBGSVJTVCAoYmVmb3JlIGFscGhhKG9wYWNpdHk9eHgpKSB0byBhdm9pZCBhbiBJRSBidWcgdGhhdCBzbGljZXMgcGFydCBvZiB0aGUgb2JqZWN0IHdoZW4gcm90YXRpb24gaXMgYXBwbGllZCB3aXRoIGFscGhhLlxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly9hdCB0aGUgZW5kIG9yIGJlZ2lubmluZyBvZiB0aGUgdHdlZW4sIGlmIHRoZSBtYXRyaXggaXMgbm9ybWFsICgxLCAwLCAwLCAxKSBhbmQgb3BhY2l0eSBpcyAxMDAgKG9yIGRvZXNuJ3QgZXhpc3QpLCByZW1vdmUgdGhlIGZpbHRlciB0byBpbXByb3ZlIGJyb3dzZXIgcGVyZm9ybWFuY2UuXG5cdFx0XHRcdGlmICh2ID09PSAwIHx8IHYgPT09IDEpIGlmIChhID09PSAxKSBpZiAoYiA9PT0gMCkgaWYgKGMgPT09IDApIGlmIChkID09PSAxKSBpZiAoIWNsaXAgfHwgbS5pbmRleE9mKFwiRHg9MCwgRHk9MFwiKSAhPT0gLTEpIGlmICghX29wYWNpdHlFeHAudGVzdChmaWx0ZXJzKSB8fCBwYXJzZUZsb2F0KFJlZ0V4cC4kMSkgPT09IDEwMCkgaWYgKGZpbHRlcnMuaW5kZXhPZihcImdyYWRpZW50KFwiICYmIGZpbHRlcnMuaW5kZXhPZihcIkFscGhhXCIpKSA9PT0gLTEpIHtcblx0XHRcdFx0XHRzdHlsZS5yZW1vdmVBdHRyaWJ1dGUoXCJmaWx0ZXJcIik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvL3dlIG11c3Qgc2V0IHRoZSBtYXJnaW5zIEFGVEVSIGFwcGx5aW5nIHRoZSBmaWx0ZXIgaW4gb3JkZXIgdG8gYXZvaWQgc29tZSBidWdzIGluIElFOCB0aGF0IGNvdWxkIChpbiByYXJlIHNjZW5hcmlvcykgY2F1c2UgdGhlbSB0byBiZSBpZ25vcmVkIGludGVybWl0dGVudGx5ICh2aWJyYXRpb24pLlxuXHRcdFx0XHRpZiAoIWNsaXApIHtcblx0XHRcdFx0XHR2YXIgbXVsdCA9IChfaWVWZXJzIDwgOCkgPyAxIDogLTEsIC8vaW4gSW50ZXJuZXQgRXhwbG9yZXIgNyBhbmQgYmVmb3JlLCB0aGUgYm94IG1vZGVsIGlzIGJyb2tlbiwgY2F1c2luZyB0aGUgYnJvd3NlciB0byB0cmVhdCB0aGUgd2lkdGgvaGVpZ2h0IG9mIHRoZSBhY3R1YWwgcm90YXRlZCBmaWx0ZXJlZCBpbWFnZSBhcyB0aGUgd2lkdGgvaGVpZ2h0IG9mIHRoZSBib3ggaXRzZWxmLCBidXQgTWljcm9zb2Z0IGNvcnJlY3RlZCB0aGF0IGluIElFOC4gV2UgbXVzdCB1c2UgYSBuZWdhdGl2ZSBvZmZzZXQgaW4gSUU4IG9uIHRoZSByaWdodC9ib3R0b21cblx0XHRcdFx0XHRcdG1hcmcsIHByb3AsIGRpZjtcblx0XHRcdFx0XHRkeCA9IHQuaWVPZmZzZXRYIHx8IDA7XG5cdFx0XHRcdFx0ZHkgPSB0LmllT2Zmc2V0WSB8fCAwO1xuXHRcdFx0XHRcdHQuaWVPZmZzZXRYID0gTWF0aC5yb3VuZCgodyAtICgoYSA8IDAgPyAtYSA6IGEpICogdyArIChiIDwgMCA/IC1iIDogYikgKiBoKSkgLyAyICsgb3gpO1xuXHRcdFx0XHRcdHQuaWVPZmZzZXRZID0gTWF0aC5yb3VuZCgoaCAtICgoZCA8IDAgPyAtZCA6IGQpICogaCArIChjIDwgMCA/IC1jIDogYykgKiB3KSkgLyAyICsgb3kpO1xuXHRcdFx0XHRcdGZvciAoaSA9IDA7IGkgPCA0OyBpKyspIHtcblx0XHRcdFx0XHRcdHByb3AgPSBfbWFyZ2luc1tpXTtcblx0XHRcdFx0XHRcdG1hcmcgPSBjc1twcm9wXTtcblx0XHRcdFx0XHRcdC8vd2UgbmVlZCB0byBnZXQgdGhlIGN1cnJlbnQgbWFyZ2luIGluIGNhc2UgaXQgaXMgYmVpbmcgdHdlZW5lZCBzZXBhcmF0ZWx5ICh3ZSB3YW50IHRvIHJlc3BlY3QgdGhhdCB0d2VlbidzIGNoYW5nZXMpXG5cdFx0XHRcdFx0XHR2YWwgPSAobWFyZy5pbmRleE9mKFwicHhcIikgIT09IC0xKSA/IHBhcnNlRmxvYXQobWFyZykgOiBfY29udmVydFRvUGl4ZWxzKHRoaXMudCwgcHJvcCwgcGFyc2VGbG9hdChtYXJnKSwgbWFyZy5yZXBsYWNlKF9zdWZmaXhFeHAsIFwiXCIpKSB8fCAwO1xuXHRcdFx0XHRcdFx0aWYgKHZhbCAhPT0gdFtwcm9wXSkge1xuXHRcdFx0XHRcdFx0XHRkaWYgPSAoaSA8IDIpID8gLXQuaWVPZmZzZXRYIDogLXQuaWVPZmZzZXRZOyAvL2lmIGFub3RoZXIgdHdlZW4gaXMgY29udHJvbGxpbmcgYSBtYXJnaW4sIHdlIGNhbm5vdCBvbmx5IGFwcGx5IHRoZSBkaWZmZXJlbmNlIGluIHRoZSBpZU9mZnNldHMsIHNvIHdlIGVzc2VudGlhbGx5IHplcm8tb3V0IHRoZSBkeCBhbmQgZHkgaGVyZSBpbiB0aGF0IGNhc2UuIFdlIHJlY29yZCB0aGUgbWFyZ2luKHMpIGxhdGVyIHNvIHRoYXQgd2UgY2FuIGtlZXAgY29tcGFyaW5nIHRoZW0sIG1ha2luZyB0aGlzIGNvZGUgdmVyeSBmbGV4aWJsZS5cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGRpZiA9IChpIDwgMikgPyBkeCAtIHQuaWVPZmZzZXRYIDogZHkgLSB0LmllT2Zmc2V0WTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHN0eWxlW3Byb3BdID0gKHRbcHJvcF0gPSBNYXRoLnJvdW5kKCB2YWwgLSBkaWYgKiAoKGkgPT09IDAgfHwgaSA9PT0gMikgPyAxIDogbXVsdCkgKSkgKyBcInB4XCI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHQvKiB0cmFuc2xhdGVzIGEgc3VwZXIgc21hbGwgZGVjaW1hbCB0byBhIHN0cmluZyBXSVRIT1VUIHNjaWVudGlmaWMgbm90YXRpb25cblx0XHRcdF9zYWZlRGVjaW1hbCA9IGZ1bmN0aW9uKG4pIHtcblx0XHRcdFx0dmFyIHMgPSAobiA8IDAgPyAtbiA6IG4pICsgXCJcIixcblx0XHRcdFx0XHRhID0gcy5zcGxpdChcImUtXCIpO1xuXHRcdFx0XHRyZXR1cm4gKG4gPCAwID8gXCItMC5cIiA6IFwiMC5cIikgKyBuZXcgQXJyYXkocGFyc2VJbnQoYVsxXSwgMTApIHx8IDApLmpvaW4oXCIwXCIpICsgYVswXS5zcGxpdChcIi5cIikuam9pbihcIlwiKTtcblx0XHRcdH0sXG5cdFx0XHQqL1xuXG5cdFx0XHRfc2V0VHJhbnNmb3JtUmF0aW8gPSBfaW50ZXJuYWxzLnNldDNEVHJhbnNmb3JtUmF0aW8gPSBfaW50ZXJuYWxzLnNldFRyYW5zZm9ybVJhdGlvID0gZnVuY3Rpb24odikge1xuXHRcdFx0XHR2YXIgdCA9IHRoaXMuZGF0YSwgLy9yZWZlcnMgdG8gdGhlIGVsZW1lbnQncyBfZ3NUcmFuc2Zvcm0gb2JqZWN0XG5cdFx0XHRcdFx0c3R5bGUgPSB0aGlzLnQuc3R5bGUsXG5cdFx0XHRcdFx0YW5nbGUgPSB0LnJvdGF0aW9uLFxuXHRcdFx0XHRcdHJvdGF0aW9uWCA9IHQucm90YXRpb25YLFxuXHRcdFx0XHRcdHJvdGF0aW9uWSA9IHQucm90YXRpb25ZLFxuXHRcdFx0XHRcdHN4ID0gdC5zY2FsZVgsXG5cdFx0XHRcdFx0c3kgPSB0LnNjYWxlWSxcblx0XHRcdFx0XHRzeiA9IHQuc2NhbGVaLFxuXHRcdFx0XHRcdHggPSB0LngsXG5cdFx0XHRcdFx0eSA9IHQueSxcblx0XHRcdFx0XHR6ID0gdC56LFxuXHRcdFx0XHRcdGlzU1ZHID0gdC5zdmcsXG5cdFx0XHRcdFx0cGVyc3BlY3RpdmUgPSB0LnBlcnNwZWN0aXZlLFxuXHRcdFx0XHRcdGZvcmNlM0QgPSB0LmZvcmNlM0QsXG5cdFx0XHRcdFx0YTExLCBhMTIsIGExMywgYTIxLCBhMjIsIGEyMywgYTMxLCBhMzIsIGEzMywgYTQxLCBhNDIsIGE0Myxcblx0XHRcdFx0XHR6T3JpZ2luLCBtaW4sIGNvcywgc2luLCB0MSwgdDIsIHRyYW5zZm9ybSwgY29tbWEsIHplcm8sIHNrZXcsIHJuZDtcblx0XHRcdFx0Ly9jaGVjayB0byBzZWUgaWYgd2Ugc2hvdWxkIHJlbmRlciBhcyAyRCAoYW5kIFNWR3MgbXVzdCB1c2UgMkQgd2hlbiBfdXNlU1ZHVHJhbnNmb3JtQXR0ciBpcyB0cnVlKVxuXHRcdFx0XHRpZiAoKCgoKHYgPT09IDEgfHwgdiA9PT0gMCkgJiYgZm9yY2UzRCA9PT0gXCJhdXRvXCIgJiYgKHRoaXMudHdlZW4uX3RvdGFsVGltZSA9PT0gdGhpcy50d2Vlbi5fdG90YWxEdXJhdGlvbiB8fCAhdGhpcy50d2Vlbi5fdG90YWxUaW1lKSkgfHwgIWZvcmNlM0QpICYmICF6ICYmICFwZXJzcGVjdGl2ZSAmJiAhcm90YXRpb25ZICYmICFyb3RhdGlvblgpIHx8IChfdXNlU1ZHVHJhbnNmb3JtQXR0ciAmJiBpc1NWRykgfHwgIV9zdXBwb3J0czNEKSB7IC8vb24gdGhlIGZpbmFsIHJlbmRlciAod2hpY2ggY291bGQgYmUgMCBmb3IgYSBmcm9tIHR3ZWVuKSwgaWYgdGhlcmUgYXJlIG5vIDNEIGFzcGVjdHMsIHJlbmRlciBpbiAyRCB0byBmcmVlIHVwIG1lbW9yeSBhbmQgaW1wcm92ZSBwZXJmb3JtYW5jZSBlc3BlY2lhbGx5IG9uIG1vYmlsZSBkZXZpY2VzLiBDaGVjayB0aGUgdHdlZW4ncyB0b3RhbFRpbWUvdG90YWxEdXJhdGlvbiB0b28gaW4gb3JkZXIgdG8gbWFrZSBzdXJlIGl0IGRvZXNuJ3QgaGFwcGVuIGJldHdlZW4gcmVwZWF0cyBpZiBpdCdzIGEgcmVwZWF0aW5nIHR3ZWVuLlxuXG5cdFx0XHRcdFx0Ly8yRFxuXHRcdFx0XHRcdGlmIChhbmdsZSB8fCB0LnNrZXdYIHx8IGlzU1ZHKSB7XG5cdFx0XHRcdFx0XHRhbmdsZSAqPSBfREVHMlJBRDtcblx0XHRcdFx0XHRcdHNrZXcgPSB0LnNrZXdYICogX0RFRzJSQUQ7XG5cdFx0XHRcdFx0XHRybmQgPSAxMDAwMDA7XG5cdFx0XHRcdFx0XHRhMTEgPSBNYXRoLmNvcyhhbmdsZSkgKiBzeDtcblx0XHRcdFx0XHRcdGEyMSA9IE1hdGguc2luKGFuZ2xlKSAqIHN4O1xuXHRcdFx0XHRcdFx0YTEyID0gTWF0aC5zaW4oYW5nbGUgLSBza2V3KSAqIC1zeTtcblx0XHRcdFx0XHRcdGEyMiA9IE1hdGguY29zKGFuZ2xlIC0gc2tldykgKiBzeTtcblx0XHRcdFx0XHRcdGlmIChza2V3ICYmIHQuc2tld1R5cGUgPT09IFwic2ltcGxlXCIpIHsgLy9ieSBkZWZhdWx0LCB3ZSBjb21wZW5zYXRlIHNrZXdpbmcgb24gdGhlIG90aGVyIGF4aXMgdG8gbWFrZSBpdCBsb29rIG1vcmUgbmF0dXJhbCwgYnV0IHlvdSBjYW4gc2V0IHRoZSBza2V3VHlwZSB0byBcInNpbXBsZVwiIHRvIHVzZSB0aGUgdW5jb21wZW5zYXRlZCBza2V3aW5nIHRoYXQgQ1NTIGRvZXNcblx0XHRcdFx0XHRcdFx0dDEgPSBNYXRoLnRhbihza2V3KTtcblx0XHRcdFx0XHRcdFx0dDEgPSBNYXRoLnNxcnQoMSArIHQxICogdDEpO1xuXHRcdFx0XHRcdFx0XHRhMTIgKj0gdDE7XG5cdFx0XHRcdFx0XHRcdGEyMiAqPSB0MTtcblx0XHRcdFx0XHRcdFx0aWYgKHQuc2tld1kpIHtcblx0XHRcdFx0XHRcdFx0XHRhMTEgKj0gdDE7XG5cdFx0XHRcdFx0XHRcdFx0YTIxICo9IHQxO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXNTVkcpIHtcblx0XHRcdFx0XHRcdFx0eCArPSB0LnhPcmlnaW4gLSAodC54T3JpZ2luICogYTExICsgdC55T3JpZ2luICogYTEyKSArIHQueE9mZnNldDtcblx0XHRcdFx0XHRcdFx0eSArPSB0LnlPcmlnaW4gLSAodC54T3JpZ2luICogYTIxICsgdC55T3JpZ2luICogYTIyKSArIHQueU9mZnNldDtcblx0XHRcdFx0XHRcdFx0aWYgKF91c2VTVkdUcmFuc2Zvcm1BdHRyICYmICh0LnhQZXJjZW50IHx8IHQueVBlcmNlbnQpKSB7IC8vVGhlIFNWRyBzcGVjIGRvZXNuJ3Qgc3VwcG9ydCBwZXJjZW50YWdlLWJhc2VkIHRyYW5zbGF0aW9uIGluIHRoZSBcInRyYW5zZm9ybVwiIGF0dHJpYnV0ZSwgc28gd2UgbWVyZ2UgaXQgaW50byB0aGUgbWF0cml4IHRvIHNpbXVsYXRlIGl0LlxuXHRcdFx0XHRcdFx0XHRcdG1pbiA9IHRoaXMudC5nZXRCQm94KCk7XG5cdFx0XHRcdFx0XHRcdFx0eCArPSB0LnhQZXJjZW50ICogMC4wMSAqIG1pbi53aWR0aDtcblx0XHRcdFx0XHRcdFx0XHR5ICs9IHQueVBlcmNlbnQgKiAwLjAxICogbWluLmhlaWdodDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRtaW4gPSAwLjAwMDAwMTtcblx0XHRcdFx0XHRcdFx0aWYgKHggPCBtaW4pIGlmICh4ID4gLW1pbikge1xuXHRcdFx0XHRcdFx0XHRcdHggPSAwO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICh5IDwgbWluKSBpZiAoeSA+IC1taW4pIHtcblx0XHRcdFx0XHRcdFx0XHR5ID0gMDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dHJhbnNmb3JtID0gKCgoYTExICogcm5kKSB8IDApIC8gcm5kKSArIFwiLFwiICsgKCgoYTIxICogcm5kKSB8IDApIC8gcm5kKSArIFwiLFwiICsgKCgoYTEyICogcm5kKSB8IDApIC8gcm5kKSArIFwiLFwiICsgKCgoYTIyICogcm5kKSB8IDApIC8gcm5kKSArIFwiLFwiICsgeCArIFwiLFwiICsgeSArIFwiKVwiO1xuXHRcdFx0XHRcdFx0aWYgKGlzU1ZHICYmIF91c2VTVkdUcmFuc2Zvcm1BdHRyKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudC5zZXRBdHRyaWJ1dGUoXCJ0cmFuc2Zvcm1cIiwgXCJtYXRyaXgoXCIgKyB0cmFuc2Zvcm0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly9zb21lIGJyb3dzZXJzIGhhdmUgYSBoYXJkIHRpbWUgd2l0aCB2ZXJ5IHNtYWxsIHZhbHVlcyBsaWtlIDIuNDQ5MjkzNTk4Mjk0NzA2NGUtMTYgKG5vdGljZSB0aGUgXCJlLVwiIHRvd2FyZHMgdGhlIGVuZCkgYW5kIHdvdWxkIHJlbmRlciB0aGUgb2JqZWN0IHNsaWdodGx5IG9mZi4gU28gd2Ugcm91bmQgdG8gNSBkZWNpbWFsIHBsYWNlcy5cblx0XHRcdFx0XHRcdFx0c3R5bGVbX3RyYW5zZm9ybVByb3BdID0gKCh0LnhQZXJjZW50IHx8IHQueVBlcmNlbnQpID8gXCJ0cmFuc2xhdGUoXCIgKyB0LnhQZXJjZW50ICsgXCIlLFwiICsgdC55UGVyY2VudCArIFwiJSkgbWF0cml4KFwiIDogXCJtYXRyaXgoXCIpICsgdHJhbnNmb3JtO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzdHlsZVtfdHJhbnNmb3JtUHJvcF0gPSAoKHQueFBlcmNlbnQgfHwgdC55UGVyY2VudCkgPyBcInRyYW5zbGF0ZShcIiArIHQueFBlcmNlbnQgKyBcIiUsXCIgKyB0LnlQZXJjZW50ICsgXCIlKSBtYXRyaXgoXCIgOiBcIm1hdHJpeChcIikgKyBzeCArIFwiLDAsMCxcIiArIHN5ICsgXCIsXCIgKyB4ICsgXCIsXCIgKyB5ICsgXCIpXCI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChfaXNGaXJlZm94KSB7IC8vRmlyZWZveCBoYXMgYSBidWcgKGF0IGxlYXN0IGluIHYyNSkgdGhhdCBjYXVzZXMgaXQgdG8gcmVuZGVyIHRoZSB0cmFuc3BhcmVudCBwYXJ0IG9mIDMyLWJpdCBQTkcgaW1hZ2VzIGFzIGJsYWNrIHdoZW4gZGlzcGxheWVkIGluc2lkZSBhbiBpZnJhbWUgYW5kIHRoZSAzRCBzY2FsZSBpcyB2ZXJ5IHNtYWxsIGFuZCBkb2Vzbid0IGNoYW5nZSBzdWZmaWNpZW50bHkgZW5vdWdoIGJldHdlZW4gcmVuZGVycyAobGlrZSBpZiB5b3UgdXNlIGEgUG93ZXI0LmVhc2VJbk91dCB0byBzY2FsZSBmcm9tIDAgdG8gMSB3aGVyZSB0aGUgYmVnaW5uaW5nIHZhbHVlcyBvbmx5IGNoYW5nZSBhIHRpbnkgYW1vdW50IHRvIGJlZ2luIHRoZSB0d2VlbiBiZWZvcmUgYWNjZWxlcmF0aW5nKS4gSW4gdGhpcyBjYXNlLCB3ZSBmb3JjZSB0aGUgc2NhbGUgdG8gYmUgMC4wMDAwMiBpbnN0ZWFkIHdoaWNoIGlzIHZpc3VhbGx5IHRoZSBzYW1lIGJ1dCB3b3JrcyBhcm91bmQgdGhlIEZpcmVmb3ggaXNzdWUuXG5cdFx0XHRcdFx0bWluID0gMC4wMDAxO1xuXHRcdFx0XHRcdGlmIChzeCA8IG1pbiAmJiBzeCA+IC1taW4pIHtcblx0XHRcdFx0XHRcdHN4ID0gc3ogPSAwLjAwMDAyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc3kgPCBtaW4gJiYgc3kgPiAtbWluKSB7XG5cdFx0XHRcdFx0XHRzeSA9IHN6ID0gMC4wMDAwMjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBlcnNwZWN0aXZlICYmICF0LnogJiYgIXQucm90YXRpb25YICYmICF0LnJvdGF0aW9uWSkgeyAvL0ZpcmVmb3ggaGFzIGEgYnVnIHRoYXQgY2F1c2VzIGVsZW1lbnRzIHRvIGhhdmUgYW4gb2RkIHN1cGVyLXRoaW4sIGJyb2tlbi9kb3R0ZWQgYmxhY2sgYm9yZGVyIG9uIGVsZW1lbnRzIHRoYXQgaGF2ZSBhIHBlcnNwZWN0aXZlIHNldCBidXQgYXJlbid0IHV0aWxpemluZyAzRCBzcGFjZSAobm8gcm90YXRpb25YLCByb3RhdGlvblksIG9yIHopLlxuXHRcdFx0XHRcdFx0cGVyc3BlY3RpdmUgPSAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYW5nbGUgfHwgdC5za2V3WCkge1xuXHRcdFx0XHRcdGFuZ2xlICo9IF9ERUcyUkFEO1xuXHRcdFx0XHRcdGNvcyA9IGExMSA9IE1hdGguY29zKGFuZ2xlKTtcblx0XHRcdFx0XHRzaW4gPSBhMjEgPSBNYXRoLnNpbihhbmdsZSk7XG5cdFx0XHRcdFx0aWYgKHQuc2tld1gpIHtcblx0XHRcdFx0XHRcdGFuZ2xlIC09IHQuc2tld1ggKiBfREVHMlJBRDtcblx0XHRcdFx0XHRcdGNvcyA9IE1hdGguY29zKGFuZ2xlKTtcblx0XHRcdFx0XHRcdHNpbiA9IE1hdGguc2luKGFuZ2xlKTtcblx0XHRcdFx0XHRcdGlmICh0LnNrZXdUeXBlID09PSBcInNpbXBsZVwiKSB7IC8vYnkgZGVmYXVsdCwgd2UgY29tcGVuc2F0ZSBza2V3aW5nIG9uIHRoZSBvdGhlciBheGlzIHRvIG1ha2UgaXQgbG9vayBtb3JlIG5hdHVyYWwsIGJ1dCB5b3UgY2FuIHNldCB0aGUgc2tld1R5cGUgdG8gXCJzaW1wbGVcIiB0byB1c2UgdGhlIHVuY29tcGVuc2F0ZWQgc2tld2luZyB0aGF0IENTUyBkb2VzXG5cdFx0XHRcdFx0XHRcdHQxID0gTWF0aC50YW4odC5za2V3WCAqIF9ERUcyUkFEKTtcblx0XHRcdFx0XHRcdFx0dDEgPSBNYXRoLnNxcnQoMSArIHQxICogdDEpO1xuXHRcdFx0XHRcdFx0XHRjb3MgKj0gdDE7XG5cdFx0XHRcdFx0XHRcdHNpbiAqPSB0MTtcblx0XHRcdFx0XHRcdFx0aWYgKHQuc2tld1kpIHtcblx0XHRcdFx0XHRcdFx0XHRhMTEgKj0gdDE7XG5cdFx0XHRcdFx0XHRcdFx0YTIxICo9IHQxO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGExMiA9IC1zaW47XG5cdFx0XHRcdFx0YTIyID0gY29zO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoIXJvdGF0aW9uWSAmJiAhcm90YXRpb25YICYmIHN6ID09PSAxICYmICFwZXJzcGVjdGl2ZSAmJiAhaXNTVkcpIHsgLy9pZiB3ZSdyZSBvbmx5IHRyYW5zbGF0aW5nIGFuZC9vciAyRCBzY2FsaW5nLCB0aGlzIGlzIGZhc3Rlci4uLlxuXHRcdFx0XHRcdHN0eWxlW190cmFuc2Zvcm1Qcm9wXSA9ICgodC54UGVyY2VudCB8fCB0LnlQZXJjZW50KSA/IFwidHJhbnNsYXRlKFwiICsgdC54UGVyY2VudCArIFwiJSxcIiArIHQueVBlcmNlbnQgKyBcIiUpIHRyYW5zbGF0ZTNkKFwiIDogXCJ0cmFuc2xhdGUzZChcIikgKyB4ICsgXCJweCxcIiArIHkgKyBcInB4LFwiICsgeiArXCJweClcIiArICgoc3ggIT09IDEgfHwgc3kgIT09IDEpID8gXCIgc2NhbGUoXCIgKyBzeCArIFwiLFwiICsgc3kgKyBcIilcIiA6IFwiXCIpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhMTEgPSBhMjIgPSAxO1xuXHRcdFx0XHRcdGExMiA9IGEyMSA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gS0VZICBJTkRFWCAgIEFGRkVDVFNcblx0XHRcdFx0Ly8gYTExICAwICAgICAgIHJvdGF0aW9uLCByb3RhdGlvblksIHNjYWxlWFxuXHRcdFx0XHQvLyBhMjEgIDEgICAgICAgcm90YXRpb24sIHJvdGF0aW9uWSwgc2NhbGVYXG5cdFx0XHRcdC8vIGEzMSAgMiAgICAgICByb3RhdGlvblksIHNjYWxlWFxuXHRcdFx0XHQvLyBhNDEgIDMgICAgICAgcm90YXRpb25ZLCBzY2FsZVhcblx0XHRcdFx0Ly8gYTEyICA0ICAgICAgIHJvdGF0aW9uLCBza2V3WCwgcm90YXRpb25YLCBzY2FsZVlcblx0XHRcdFx0Ly8gYTIyICA1ICAgICAgIHJvdGF0aW9uLCBza2V3WCwgcm90YXRpb25YLCBzY2FsZVlcblx0XHRcdFx0Ly8gYTMyICA2ICAgICAgIHJvdGF0aW9uWCwgc2NhbGVZXG5cdFx0XHRcdC8vIGE0MiAgNyAgICAgICByb3RhdGlvblgsIHNjYWxlWVxuXHRcdFx0XHQvLyBhMTMgIDggICAgICAgcm90YXRpb25ZLCByb3RhdGlvblgsIHNjYWxlWlxuXHRcdFx0XHQvLyBhMjMgIDkgICAgICAgcm90YXRpb25ZLCByb3RhdGlvblgsIHNjYWxlWlxuXHRcdFx0XHQvLyBhMzMgIDEwICAgICAgcm90YXRpb25ZLCByb3RhdGlvblgsIHNjYWxlWlxuXHRcdFx0XHQvLyBhNDMgIDExICAgICAgcm90YXRpb25ZLCByb3RhdGlvblgsIHBlcnNwZWN0aXZlLCBzY2FsZVpcblx0XHRcdFx0Ly8gYTE0ICAxMiAgICAgIHgsIHpPcmlnaW4sIHN2Z09yaWdpblxuXHRcdFx0XHQvLyBhMjQgIDEzICAgICAgeSwgek9yaWdpbiwgc3ZnT3JpZ2luXG5cdFx0XHRcdC8vIGEzNCAgMTQgICAgICB6LCB6T3JpZ2luXG5cdFx0XHRcdC8vIGE0NCAgMTVcblx0XHRcdFx0Ly8gcm90YXRpb246IE1hdGguYXRhbjIoYTIxLCBhMTEpXG5cdFx0XHRcdC8vIHJvdGF0aW9uWTogTWF0aC5hdGFuMihhMTMsIGEzMykgKG9yIE1hdGguYXRhbjIoYTEzLCBhMTEpKVxuXHRcdFx0XHQvLyByb3RhdGlvblg6IE1hdGguYXRhbjIoYTMyLCBhMzMpXG5cdFx0XHRcdGEzMyA9IDE7XG5cdFx0XHRcdGExMyA9IGEyMyA9IGEzMSA9IGEzMiA9IGE0MSA9IGE0MiA9IDA7XG5cdFx0XHRcdGE0MyA9IChwZXJzcGVjdGl2ZSkgPyAtMSAvIHBlcnNwZWN0aXZlIDogMDtcblx0XHRcdFx0ek9yaWdpbiA9IHQuek9yaWdpbjtcblx0XHRcdFx0bWluID0gMC4wMDAwMDE7IC8vdGhyZXNob2xkIGJlbG93IHdoaWNoIGJyb3dzZXJzIHVzZSBzY2llbnRpZmljIG5vdGF0aW9uIHdoaWNoIHdvbid0IHdvcmsuXG5cdFx0XHRcdGNvbW1hID0gXCIsXCI7XG5cdFx0XHRcdHplcm8gPSBcIjBcIjtcblx0XHRcdFx0YW5nbGUgPSByb3RhdGlvblkgKiBfREVHMlJBRDtcblx0XHRcdFx0aWYgKGFuZ2xlKSB7XG5cdFx0XHRcdFx0Y29zID0gTWF0aC5jb3MoYW5nbGUpO1xuXHRcdFx0XHRcdHNpbiA9IE1hdGguc2luKGFuZ2xlKTtcblx0XHRcdFx0XHRhMzEgPSAtc2luO1xuXHRcdFx0XHRcdGE0MSA9IGE0Myotc2luO1xuXHRcdFx0XHRcdGExMyA9IGExMSpzaW47XG5cdFx0XHRcdFx0YTIzID0gYTIxKnNpbjtcblx0XHRcdFx0XHRhMzMgPSBjb3M7XG5cdFx0XHRcdFx0YTQzICo9IGNvcztcblx0XHRcdFx0XHRhMTEgKj0gY29zO1xuXHRcdFx0XHRcdGEyMSAqPSBjb3M7XG5cdFx0XHRcdH1cblx0XHRcdFx0YW5nbGUgPSByb3RhdGlvblggKiBfREVHMlJBRDtcblx0XHRcdFx0aWYgKGFuZ2xlKSB7XG5cdFx0XHRcdFx0Y29zID0gTWF0aC5jb3MoYW5nbGUpO1xuXHRcdFx0XHRcdHNpbiA9IE1hdGguc2luKGFuZ2xlKTtcblx0XHRcdFx0XHR0MSA9IGExMipjb3MrYTEzKnNpbjtcblx0XHRcdFx0XHR0MiA9IGEyMipjb3MrYTIzKnNpbjtcblx0XHRcdFx0XHRhMzIgPSBhMzMqc2luO1xuXHRcdFx0XHRcdGE0MiA9IGE0MypzaW47XG5cdFx0XHRcdFx0YTEzID0gYTEyKi1zaW4rYTEzKmNvcztcblx0XHRcdFx0XHRhMjMgPSBhMjIqLXNpbithMjMqY29zO1xuXHRcdFx0XHRcdGEzMyA9IGEzMypjb3M7XG5cdFx0XHRcdFx0YTQzID0gYTQzKmNvcztcblx0XHRcdFx0XHRhMTIgPSB0MTtcblx0XHRcdFx0XHRhMjIgPSB0Mjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3ogIT09IDEpIHtcblx0XHRcdFx0XHRhMTMqPXN6O1xuXHRcdFx0XHRcdGEyMyo9c3o7XG5cdFx0XHRcdFx0YTMzKj1zejtcblx0XHRcdFx0XHRhNDMqPXN6O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzeSAhPT0gMSkge1xuXHRcdFx0XHRcdGExMio9c3k7XG5cdFx0XHRcdFx0YTIyKj1zeTtcblx0XHRcdFx0XHRhMzIqPXN5O1xuXHRcdFx0XHRcdGE0Mio9c3k7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHN4ICE9PSAxKSB7XG5cdFx0XHRcdFx0YTExKj1zeDtcblx0XHRcdFx0XHRhMjEqPXN4O1xuXHRcdFx0XHRcdGEzMSo9c3g7XG5cdFx0XHRcdFx0YTQxKj1zeDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh6T3JpZ2luIHx8IGlzU1ZHKSB7XG5cdFx0XHRcdFx0aWYgKHpPcmlnaW4pIHtcblx0XHRcdFx0XHRcdHggKz0gYTEzKi16T3JpZ2luO1xuXHRcdFx0XHRcdFx0eSArPSBhMjMqLXpPcmlnaW47XG5cdFx0XHRcdFx0XHR6ICs9IGEzMyotek9yaWdpbit6T3JpZ2luO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXNTVkcpIHsgLy9kdWUgdG8gYnVncyBpbiBzb21lIGJyb3dzZXJzLCB3ZSBuZWVkIHRvIG1hbmFnZSB0aGUgdHJhbnNmb3JtLW9yaWdpbiBvZiBTVkcgbWFudWFsbHlcblx0XHRcdFx0XHRcdHggKz0gdC54T3JpZ2luIC0gKHQueE9yaWdpbiAqIGExMSArIHQueU9yaWdpbiAqIGExMikgKyB0LnhPZmZzZXQ7XG5cdFx0XHRcdFx0XHR5ICs9IHQueU9yaWdpbiAtICh0LnhPcmlnaW4gKiBhMjEgKyB0LnlPcmlnaW4gKiBhMjIpICsgdC55T2Zmc2V0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoeCA8IG1pbiAmJiB4ID4gLW1pbikge1xuXHRcdFx0XHRcdFx0eCA9IHplcm87XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh5IDwgbWluICYmIHkgPiAtbWluKSB7XG5cdFx0XHRcdFx0XHR5ID0gemVybztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHogPCBtaW4gJiYgeiA+IC1taW4pIHtcblx0XHRcdFx0XHRcdHogPSAwOyAvL2Rvbid0IHVzZSBzdHJpbmcgYmVjYXVzZSB3ZSBjYWxjdWxhdGUgcGVyc3BlY3RpdmUgbGF0ZXIgYW5kIG5lZWQgdGhlIG51bWJlci5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvL29wdGltaXplZCB3YXkgb2YgY29uY2F0ZW5hdGluZyBhbGwgdGhlIHZhbHVlcyBpbnRvIGEgc3RyaW5nLiBJZiB3ZSBkbyBpdCBhbGwgaW4gb25lIHNob3QsIGl0J3Mgc2xvd2VyIGJlY2F1c2Ugb2YgdGhlIHdheSBicm93c2VycyBoYXZlIHRvIGNyZWF0ZSB0ZW1wIHN0cmluZ3MgYW5kIHRoZSB3YXkgaXQgYWZmZWN0cyBtZW1vcnkuIElmIHdlIGRvIGl0IHBpZWNlLWJ5LXBpZWNlIHdpdGggKz0sIGl0J3MgYSBiaXQgc2xvd2VyIHRvby4gV2UgZm91bmQgdGhhdCBkb2luZyBpdCBpbiB0aGVzZSBzaXplZCBjaHVua3Mgd29ya3MgYmVzdCBvdmVyYWxsOlxuXHRcdFx0XHR0cmFuc2Zvcm0gPSAoKHQueFBlcmNlbnQgfHwgdC55UGVyY2VudCkgPyBcInRyYW5zbGF0ZShcIiArIHQueFBlcmNlbnQgKyBcIiUsXCIgKyB0LnlQZXJjZW50ICsgXCIlKSBtYXRyaXgzZChcIiA6IFwibWF0cml4M2QoXCIpO1xuXHRcdFx0XHR0cmFuc2Zvcm0gKz0gKChhMTEgPCBtaW4gJiYgYTExID4gLW1pbikgPyB6ZXJvIDogYTExKSArIGNvbW1hICsgKChhMjEgPCBtaW4gJiYgYTIxID4gLW1pbikgPyB6ZXJvIDogYTIxKSArIGNvbW1hICsgKChhMzEgPCBtaW4gJiYgYTMxID4gLW1pbikgPyB6ZXJvIDogYTMxKTtcblx0XHRcdFx0dHJhbnNmb3JtICs9IGNvbW1hICsgKChhNDEgPCBtaW4gJiYgYTQxID4gLW1pbikgPyB6ZXJvIDogYTQxKSArIGNvbW1hICsgKChhMTIgPCBtaW4gJiYgYTEyID4gLW1pbikgPyB6ZXJvIDogYTEyKSArIGNvbW1hICsgKChhMjIgPCBtaW4gJiYgYTIyID4gLW1pbikgPyB6ZXJvIDogYTIyKTtcblx0XHRcdFx0aWYgKHJvdGF0aW9uWCB8fCByb3RhdGlvblkpIHsgLy9wZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gKG9mdGVuIHRoZXJlJ3Mgbm8gcm90YXRpb25YIG9yIHJvdGF0aW9uWSwgc28gd2UgY2FuIHNraXAgdGhlc2UgY2FsY3VsYXRpb25zKVxuXHRcdFx0XHRcdHRyYW5zZm9ybSArPSBjb21tYSArICgoYTMyIDwgbWluICYmIGEzMiA+IC1taW4pID8gemVybyA6IGEzMikgKyBjb21tYSArICgoYTQyIDwgbWluICYmIGE0MiA+IC1taW4pID8gemVybyA6IGE0MikgKyBjb21tYSArICgoYTEzIDwgbWluICYmIGExMyA+IC1taW4pID8gemVybyA6IGExMyk7XG5cdFx0XHRcdFx0dHJhbnNmb3JtICs9IGNvbW1hICsgKChhMjMgPCBtaW4gJiYgYTIzID4gLW1pbikgPyB6ZXJvIDogYTIzKSArIGNvbW1hICsgKChhMzMgPCBtaW4gJiYgYTMzID4gLW1pbikgPyB6ZXJvIDogYTMzKSArIGNvbW1hICsgKChhNDMgPCBtaW4gJiYgYTQzID4gLW1pbikgPyB6ZXJvIDogYTQzKSArIGNvbW1hO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRyYW5zZm9ybSArPSBcIiwwLDAsMCwwLDEsMCxcIjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cmFuc2Zvcm0gKz0geCArIGNvbW1hICsgeSArIGNvbW1hICsgeiArIGNvbW1hICsgKHBlcnNwZWN0aXZlID8gKDEgKyAoLXogLyBwZXJzcGVjdGl2ZSkpIDogMSkgKyBcIilcIjtcblxuXHRcdFx0XHRzdHlsZVtfdHJhbnNmb3JtUHJvcF0gPSB0cmFuc2Zvcm07XG5cdFx0XHR9O1xuXG5cdFx0cCA9IFRyYW5zZm9ybS5wcm90b3R5cGU7XG5cdFx0cC54ID0gcC55ID0gcC56ID0gcC5za2V3WCA9IHAuc2tld1kgPSBwLnJvdGF0aW9uID0gcC5yb3RhdGlvblggPSBwLnJvdGF0aW9uWSA9IHAuek9yaWdpbiA9IHAueFBlcmNlbnQgPSBwLnlQZXJjZW50ID0gcC54T2Zmc2V0ID0gcC55T2Zmc2V0ID0gMDtcblx0XHRwLnNjYWxlWCA9IHAuc2NhbGVZID0gcC5zY2FsZVogPSAxO1xuXG5cdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKFwidHJhbnNmb3JtLHNjYWxlLHNjYWxlWCxzY2FsZVksc2NhbGVaLHgseSx6LHJvdGF0aW9uLHJvdGF0aW9uWCxyb3RhdGlvblkscm90YXRpb25aLHNrZXdYLHNrZXdZLHNob3J0Um90YXRpb24sc2hvcnRSb3RhdGlvblgsc2hvcnRSb3RhdGlvblksc2hvcnRSb3RhdGlvblosdHJhbnNmb3JtT3JpZ2luLHN2Z09yaWdpbix0cmFuc2Zvcm1QZXJzcGVjdGl2ZSxkaXJlY3Rpb25hbFJvdGF0aW9uLHBhcnNlVHJhbnNmb3JtLGZvcmNlM0Qsc2tld1R5cGUseFBlcmNlbnQseVBlcmNlbnQsc21vb3RoT3JpZ2luXCIsIHtwYXJzZXI6ZnVuY3Rpb24odCwgZSwgcCwgY3NzcCwgcHQsIHBsdWdpbiwgdmFycykge1xuXHRcdFx0aWYgKGNzc3AuX2xhc3RQYXJzZWRUcmFuc2Zvcm0gPT09IHZhcnMpIHsgcmV0dXJuIHB0OyB9IC8vb25seSBuZWVkIHRvIHBhcnNlIHRoZSB0cmFuc2Zvcm0gb25jZSwgYW5kIG9ubHkgaWYgdGhlIGJyb3dzZXIgc3VwcG9ydHMgaXQuXG5cdFx0XHRjc3NwLl9sYXN0UGFyc2VkVHJhbnNmb3JtID0gdmFycztcblx0XHRcdHZhciBvcmlnaW5hbEdTVHJhbnNmb3JtID0gdC5fZ3NUcmFuc2Zvcm0sXG5cdFx0XHRcdHN0eWxlID0gdC5zdHlsZSxcblx0XHRcdFx0bWluID0gMC4wMDAwMDEsXG5cdFx0XHRcdGkgPSBfdHJhbnNmb3JtUHJvcHMubGVuZ3RoLFxuXHRcdFx0XHR2ID0gdmFycyxcblx0XHRcdFx0ZW5kUm90YXRpb25zID0ge30sXG5cdFx0XHRcdHRyYW5zZm9ybU9yaWdpblN0cmluZyA9IFwidHJhbnNmb3JtT3JpZ2luXCIsXG5cdFx0XHRcdG0xLCBtMiwgc2tld1ksIGNvcHksIG9yaWcsIGhhczNELCBoYXNDaGFuZ2UsIGRyLCB4LCB5O1xuXHRcdFx0aWYgKHZhcnMuZGlzcGxheSkgeyAvL2lmIHRoZSB1c2VyIGlzIHNldHRpbmcgZGlzcGxheSBkdXJpbmcgdGhpcyB0d2VlbiwgaXQgbWF5IG5vdCBiZSBpbnN0YW50aWF0ZWQgeWV0IGJ1dCB3ZSBtdXN0IGZvcmNlIGl0IGhlcmUgaW4gb3JkZXIgdG8gZ2V0IGFjY3VyYXRlIHJlYWRpbmdzLiBJZiBkaXNwbGF5IGlzIFwibm9uZVwiLCBzb21lIGJyb3dzZXJzIHJlZnVzZSB0byByZXBvcnQgdGhlIHRyYW5zZm9ybSBwcm9wZXJ0aWVzIGNvcnJlY3RseS5cblx0XHRcdFx0Y29weSA9IF9nZXRTdHlsZSh0LCBcImRpc3BsYXlcIik7XG5cdFx0XHRcdHN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG5cdFx0XHRcdG0xID0gX2dldFRyYW5zZm9ybSh0LCBfY3MsIHRydWUsIHZhcnMucGFyc2VUcmFuc2Zvcm0pO1xuXHRcdFx0XHRzdHlsZS5kaXNwbGF5ID0gY29weTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG0xID0gX2dldFRyYW5zZm9ybSh0LCBfY3MsIHRydWUsIHZhcnMucGFyc2VUcmFuc2Zvcm0pO1xuXHRcdFx0fVxuXHRcdFx0Y3NzcC5fdHJhbnNmb3JtID0gbTE7XG5cdFx0XHRpZiAodHlwZW9mKHYudHJhbnNmb3JtKSA9PT0gXCJzdHJpbmdcIiAmJiBfdHJhbnNmb3JtUHJvcCkgeyAvL2ZvciB2YWx1ZXMgbGlrZSB0cmFuc2Zvcm06XCJyb3RhdGUoNjBkZWcpIHNjYWxlKDAuNSwgMC44KVwiXG5cdFx0XHRcdGNvcHkgPSBfdGVtcERpdi5zdHlsZTsgLy9kb24ndCB1c2UgdGhlIG9yaWdpbmFsIHRhcmdldCBiZWNhdXNlIGl0IG1pZ2h0IGJlIFNWRyBpbiB3aGljaCBjYXNlIHNvbWUgYnJvd3NlcnMgZG9uJ3QgcmVwb3J0IGNvbXB1dGVkIHN0eWxlIGNvcnJlY3RseS5cblx0XHRcdFx0Y29weVtfdHJhbnNmb3JtUHJvcF0gPSB2LnRyYW5zZm9ybTtcblx0XHRcdFx0Y29weS5kaXNwbGF5ID0gXCJibG9ja1wiOyAvL2lmIGRpc3BsYXkgaXMgXCJub25lXCIsIHRoZSBicm93c2VyIG9mdGVuIHJlZnVzZXMgdG8gcmVwb3J0IHRoZSB0cmFuc2Zvcm0gcHJvcGVydGllcyBjb3JyZWN0bHkuXG5cdFx0XHRcdGNvcHkucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG5cdFx0XHRcdF9kb2MuYm9keS5hcHBlbmRDaGlsZChfdGVtcERpdik7XG5cdFx0XHRcdG0yID0gX2dldFRyYW5zZm9ybShfdGVtcERpdiwgbnVsbCwgZmFsc2UpO1xuXHRcdFx0XHRfZG9jLmJvZHkucmVtb3ZlQ2hpbGQoX3RlbXBEaXYpO1xuXHRcdFx0XHRpZiAoIW0yLnBlcnNwZWN0aXZlKSB7XG5cdFx0XHRcdFx0bTIucGVyc3BlY3RpdmUgPSBtMS5wZXJzcGVjdGl2ZTsgLy90d2VlbmluZyB0byBubyBwZXJzcGVjdGl2ZSBnaXZlcyB2ZXJ5IHVuaW50dWl0aXZlIHJlc3VsdHMgLSBqdXN0IGtlZXAgdGhlIHNhbWUgcGVyc3BlY3RpdmUgaW4gdGhhdCBjYXNlLlxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh2LnhQZXJjZW50ICE9IG51bGwpIHtcblx0XHRcdFx0XHRtMi54UGVyY2VudCA9IF9wYXJzZVZhbCh2LnhQZXJjZW50LCBtMS54UGVyY2VudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHYueVBlcmNlbnQgIT0gbnVsbCkge1xuXHRcdFx0XHRcdG0yLnlQZXJjZW50ID0gX3BhcnNlVmFsKHYueVBlcmNlbnQsIG0xLnlQZXJjZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YodikgPT09IFwib2JqZWN0XCIpIHsgLy9mb3IgdmFsdWVzIGxpa2Ugc2NhbGVYLCBzY2FsZVksIHJvdGF0aW9uLCB4LCB5LCBza2V3WCwgYW5kIHNrZXdZIG9yIHRyYW5zZm9ybTp7Li4ufSAob2JqZWN0KVxuXHRcdFx0XHRtMiA9IHtzY2FsZVg6X3BhcnNlVmFsKCh2LnNjYWxlWCAhPSBudWxsKSA/IHYuc2NhbGVYIDogdi5zY2FsZSwgbTEuc2NhbGVYKSxcblx0XHRcdFx0XHRzY2FsZVk6X3BhcnNlVmFsKCh2LnNjYWxlWSAhPSBudWxsKSA/IHYuc2NhbGVZIDogdi5zY2FsZSwgbTEuc2NhbGVZKSxcblx0XHRcdFx0XHRzY2FsZVo6X3BhcnNlVmFsKHYuc2NhbGVaLCBtMS5zY2FsZVopLFxuXHRcdFx0XHRcdHg6X3BhcnNlVmFsKHYueCwgbTEueCksXG5cdFx0XHRcdFx0eTpfcGFyc2VWYWwodi55LCBtMS55KSxcblx0XHRcdFx0XHR6Ol9wYXJzZVZhbCh2LnosIG0xLnopLFxuXHRcdFx0XHRcdHhQZXJjZW50Ol9wYXJzZVZhbCh2LnhQZXJjZW50LCBtMS54UGVyY2VudCksXG5cdFx0XHRcdFx0eVBlcmNlbnQ6X3BhcnNlVmFsKHYueVBlcmNlbnQsIG0xLnlQZXJjZW50KSxcblx0XHRcdFx0XHRwZXJzcGVjdGl2ZTpfcGFyc2VWYWwodi50cmFuc2Zvcm1QZXJzcGVjdGl2ZSwgbTEucGVyc3BlY3RpdmUpfTtcblx0XHRcdFx0ZHIgPSB2LmRpcmVjdGlvbmFsUm90YXRpb247XG5cdFx0XHRcdGlmIChkciAhPSBudWxsKSB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZihkcikgPT09IFwib2JqZWN0XCIpIHtcblx0XHRcdFx0XHRcdGZvciAoY29weSBpbiBkcikge1xuXHRcdFx0XHRcdFx0XHR2W2NvcHldID0gZHJbY29weV07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHYucm90YXRpb24gPSBkcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZih2LngpID09PSBcInN0cmluZ1wiICYmIHYueC5pbmRleE9mKFwiJVwiKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRtMi54ID0gMDtcblx0XHRcdFx0XHRtMi54UGVyY2VudCA9IF9wYXJzZVZhbCh2LngsIG0xLnhQZXJjZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZW9mKHYueSkgPT09IFwic3RyaW5nXCIgJiYgdi55LmluZGV4T2YoXCIlXCIpICE9PSAtMSkge1xuXHRcdFx0XHRcdG0yLnkgPSAwO1xuXHRcdFx0XHRcdG0yLnlQZXJjZW50ID0gX3BhcnNlVmFsKHYueSwgbTEueVBlcmNlbnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bTIucm90YXRpb24gPSBfcGFyc2VBbmdsZSgoXCJyb3RhdGlvblwiIGluIHYpID8gdi5yb3RhdGlvbiA6IChcInNob3J0Um90YXRpb25cIiBpbiB2KSA/IHYuc2hvcnRSb3RhdGlvbiArIFwiX3Nob3J0XCIgOiAoXCJyb3RhdGlvblpcIiBpbiB2KSA/IHYucm90YXRpb25aIDogbTEucm90YXRpb24sIG0xLnJvdGF0aW9uLCBcInJvdGF0aW9uXCIsIGVuZFJvdGF0aW9ucyk7XG5cdFx0XHRcdGlmIChfc3VwcG9ydHMzRCkge1xuXHRcdFx0XHRcdG0yLnJvdGF0aW9uWCA9IF9wYXJzZUFuZ2xlKChcInJvdGF0aW9uWFwiIGluIHYpID8gdi5yb3RhdGlvblggOiAoXCJzaG9ydFJvdGF0aW9uWFwiIGluIHYpID8gdi5zaG9ydFJvdGF0aW9uWCArIFwiX3Nob3J0XCIgOiBtMS5yb3RhdGlvblggfHwgMCwgbTEucm90YXRpb25YLCBcInJvdGF0aW9uWFwiLCBlbmRSb3RhdGlvbnMpO1xuXHRcdFx0XHRcdG0yLnJvdGF0aW9uWSA9IF9wYXJzZUFuZ2xlKChcInJvdGF0aW9uWVwiIGluIHYpID8gdi5yb3RhdGlvblkgOiAoXCJzaG9ydFJvdGF0aW9uWVwiIGluIHYpID8gdi5zaG9ydFJvdGF0aW9uWSArIFwiX3Nob3J0XCIgOiBtMS5yb3RhdGlvblkgfHwgMCwgbTEucm90YXRpb25ZLCBcInJvdGF0aW9uWVwiLCBlbmRSb3RhdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG0yLnNrZXdYID0gKHYuc2tld1ggPT0gbnVsbCkgPyBtMS5za2V3WCA6IF9wYXJzZUFuZ2xlKHYuc2tld1gsIG0xLnNrZXdYKTtcblxuXHRcdFx0XHQvL25vdGU6IGZvciBwZXJmb3JtYW5jZSByZWFzb25zLCB3ZSBjb21iaW5lIGFsbCBza2V3aW5nIGludG8gdGhlIHNrZXdYIGFuZCByb3RhdGlvbiB2YWx1ZXMsIGlnbm9yaW5nIHNrZXdZIGJ1dCB3ZSBtdXN0IHN0aWxsIHJlY29yZCBpdCBzbyB0aGF0IHdlIGNhbiBkaXNjZXJuIGhvdyBtdWNoIG9mIHRoZSBvdmVyYWxsIHNrZXcgaXMgYXR0cmlidXRlZCB0byBza2V3WCB2cy4gc2tld1kuIE90aGVyd2lzZSwgaWYgdGhlIHNrZXdZIHdvdWxkIGFsd2F5cyBhY3QgcmVsYXRpdmUgKHR3ZWVuIHNrZXdZIHRvIDEwZGVnLCBmb3IgZXhhbXBsZSwgbXVsdGlwbGUgdGltZXMgYW5kIGlmIHdlIGFsd2F5cyBjb21iaW5lIHRoaW5ncyBpbnRvIHNrZXdYLCB3ZSBjYW4ndCByZW1lbWJlciB0aGF0IHNrZXdZIHdhcyAxMCBmcm9tIGxhc3QgdGltZSkuIFJlbWVtYmVyLCBhIHNrZXdZIG9mIDEwIGRlZ3JlZXMgbG9va3MgdGhlIHNhbWUgYXMgYSByb3RhdGlvbiBvZiAxMCBkZWdyZWVzIHBsdXMgYSBza2V3WCBvZiAtMTAgZGVncmVlcy5cblx0XHRcdFx0bTIuc2tld1kgPSAodi5za2V3WSA9PSBudWxsKSA/IG0xLnNrZXdZIDogX3BhcnNlQW5nbGUodi5za2V3WSwgbTEuc2tld1kpO1xuXHRcdFx0XHRpZiAoKHNrZXdZID0gbTIuc2tld1kgLSBtMS5za2V3WSkpIHtcblx0XHRcdFx0XHRtMi5za2V3WCArPSBza2V3WTtcblx0XHRcdFx0XHRtMi5yb3RhdGlvbiArPSBza2V3WTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKF9zdXBwb3J0czNEICYmIHYuZm9yY2UzRCAhPSBudWxsKSB7XG5cdFx0XHRcdG0xLmZvcmNlM0QgPSB2LmZvcmNlM0Q7XG5cdFx0XHRcdGhhc0NoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdG0xLnNrZXdUeXBlID0gdi5za2V3VHlwZSB8fCBtMS5za2V3VHlwZSB8fCBDU1NQbHVnaW4uZGVmYXVsdFNrZXdUeXBlO1xuXG5cdFx0XHRoYXMzRCA9IChtMS5mb3JjZTNEIHx8IG0xLnogfHwgbTEucm90YXRpb25YIHx8IG0xLnJvdGF0aW9uWSB8fCBtMi56IHx8IG0yLnJvdGF0aW9uWCB8fCBtMi5yb3RhdGlvblkgfHwgbTIucGVyc3BlY3RpdmUpO1xuXHRcdFx0aWYgKCFoYXMzRCAmJiB2LnNjYWxlICE9IG51bGwpIHtcblx0XHRcdFx0bTIuc2NhbGVaID0gMTsgLy9ubyBuZWVkIHRvIHR3ZWVuIHNjYWxlWi5cblx0XHRcdH1cblxuXHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdHAgPSBfdHJhbnNmb3JtUHJvcHNbaV07XG5cdFx0XHRcdG9yaWcgPSBtMltwXSAtIG0xW3BdO1xuXHRcdFx0XHRpZiAob3JpZyA+IG1pbiB8fCBvcmlnIDwgLW1pbiB8fCB2W3BdICE9IG51bGwgfHwgX2ZvcmNlUFRbcF0gIT0gbnVsbCkge1xuXHRcdFx0XHRcdGhhc0NoYW5nZSA9IHRydWU7XG5cdFx0XHRcdFx0cHQgPSBuZXcgQ1NTUHJvcFR3ZWVuKG0xLCBwLCBtMVtwXSwgb3JpZywgcHQpO1xuXHRcdFx0XHRcdGlmIChwIGluIGVuZFJvdGF0aW9ucykge1xuXHRcdFx0XHRcdFx0cHQuZSA9IGVuZFJvdGF0aW9uc1twXTsgLy9kaXJlY3Rpb25hbCByb3RhdGlvbnMgdHlwaWNhbGx5IGhhdmUgY29tcGVuc2F0ZWQgdmFsdWVzIGR1cmluZyB0aGUgdHdlZW4sIGJ1dCB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB0aGV5IGVuZCBhdCBleGFjdGx5IHdoYXQgdGhlIHVzZXIgcmVxdWVzdGVkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHB0LnhzMCA9IDA7IC8vZW5zdXJlcyB0aGUgdmFsdWUgc3RheXMgbnVtZXJpYyBpbiBzZXRSYXRpbygpXG5cdFx0XHRcdFx0cHQucGx1Z2luID0gcGx1Z2luO1xuXHRcdFx0XHRcdGNzc3AuX292ZXJ3cml0ZVByb3BzLnB1c2gocHQubik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0b3JpZyA9IHYudHJhbnNmb3JtT3JpZ2luO1xuXHRcdFx0aWYgKG0xLnN2ZyAmJiAob3JpZyB8fCB2LnN2Z09yaWdpbikpIHtcblx0XHRcdFx0eCA9IG0xLnhPZmZzZXQ7IC8vd2hlbiB3ZSBjaGFuZ2UgdGhlIG9yaWdpbiwgaW4gb3JkZXIgdG8gcHJldmVudCB0aGluZ3MgZnJvbSBqdW1waW5nIHdlIGFkanVzdCB0aGUgeC95IHNvIHdlIG11c3QgcmVjb3JkIHRob3NlIGhlcmUgc28gdGhhdCB3ZSBjYW4gY3JlYXRlIFByb3BUd2VlbnMgZm9yIHRoZW0gYW5kIGZsaXAgdGhlbSBhdCB0aGUgc2FtZSB0aW1lIGFzIHRoZSBvcmlnaW5cblx0XHRcdFx0eSA9IG0xLnlPZmZzZXQ7XG5cdFx0XHRcdF9wYXJzZVNWR09yaWdpbih0LCBfcGFyc2VQb3NpdGlvbihvcmlnKSwgbTIsIHYuc3ZnT3JpZ2luLCB2LnNtb290aE9yaWdpbik7XG5cdFx0XHRcdHB0ID0gX2FkZE5vblR3ZWVuaW5nTnVtZXJpY1BUKG0xLCBcInhPcmlnaW5cIiwgKG9yaWdpbmFsR1NUcmFuc2Zvcm0gPyBtMSA6IG0yKS54T3JpZ2luLCBtMi54T3JpZ2luLCBwdCwgdHJhbnNmb3JtT3JpZ2luU3RyaW5nKTsgLy9ub3RlOiBpZiB0aGVyZSB3YXNuJ3QgYSB0cmFuc2Zvcm1PcmlnaW4gZGVmaW5lZCB5ZXQsIGp1c3Qgc3RhcnQgd2l0aCB0aGUgZGVzdGluYXRpb24gb25lOyBpdCdzIHdhc3RlZnVsIG90aGVyd2lzZSwgYW5kIGl0IGNhdXNlcyBwcm9ibGVtcyB3aXRoIGZyb21UbygpIHR3ZWVucy4gRm9yIGV4YW1wbGUsIFR3ZWVuTGl0ZS50byhcIiN3aGVlbFwiLCAzLCB7cm90YXRpb246MTgwLCB0cmFuc2Zvcm1PcmlnaW46XCI1MCUgNTAlXCIsIGRlbGF5OjF9KTsgVHdlZW5MaXRlLmZyb21UbyhcIiN3aGVlbFwiLCAzLCB7c2NhbGU6MC41LCB0cmFuc2Zvcm1PcmlnaW46XCI1MCUgNTAlXCJ9LCB7c2NhbGU6MSwgZGVsYXk6Mn0pOyB3b3VsZCBjYXVzZSBhIGp1bXAgd2hlbiB0aGUgZnJvbSB2YWx1ZXMgcmV2ZXJ0IGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIDJuZCB0d2Vlbi5cblx0XHRcdFx0cHQgPSBfYWRkTm9uVHdlZW5pbmdOdW1lcmljUFQobTEsIFwieU9yaWdpblwiLCAob3JpZ2luYWxHU1RyYW5zZm9ybSA/IG0xIDogbTIpLnlPcmlnaW4sIG0yLnlPcmlnaW4sIHB0LCB0cmFuc2Zvcm1PcmlnaW5TdHJpbmcpO1xuXHRcdFx0XHRpZiAoeCAhPT0gbTEueE9mZnNldCB8fCB5ICE9PSBtMS55T2Zmc2V0KSB7XG5cdFx0XHRcdFx0cHQgPSBfYWRkTm9uVHdlZW5pbmdOdW1lcmljUFQobTEsIFwieE9mZnNldFwiLCAob3JpZ2luYWxHU1RyYW5zZm9ybSA/IHggOiBtMS54T2Zmc2V0KSwgbTEueE9mZnNldCwgcHQsIHRyYW5zZm9ybU9yaWdpblN0cmluZyk7XG5cdFx0XHRcdFx0cHQgPSBfYWRkTm9uVHdlZW5pbmdOdW1lcmljUFQobTEsIFwieU9mZnNldFwiLCAob3JpZ2luYWxHU1RyYW5zZm9ybSA/IHkgOiBtMS55T2Zmc2V0KSwgbTEueU9mZnNldCwgcHQsIHRyYW5zZm9ybU9yaWdpblN0cmluZyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3JpZyA9IF91c2VTVkdUcmFuc2Zvcm1BdHRyID8gbnVsbCA6IFwiMHB4IDBweFwiOyAvL2NlcnRhaW4gYnJvd3NlcnMgKGxpa2UgZmlyZWZveCkgY29tcGxldGVseSBib3RjaCB0cmFuc2Zvcm0tb3JpZ2luLCBzbyB3ZSBtdXN0IHJlbW92ZSBpdCB0byBwcmV2ZW50IGl0IGZyb20gY29udGFtaW5hdGluZyB0cmFuc2Zvcm1zLiBXZSBtYW5hZ2UgaXQgb3Vyc2VsdmVzIHdpdGggeE9yaWdpbiBhbmQgeU9yaWdpblxuXHRcdFx0fVxuXHRcdFx0aWYgKG9yaWcgfHwgKF9zdXBwb3J0czNEICYmIGhhczNEICYmIG0xLnpPcmlnaW4pKSB7IC8vaWYgYW55dGhpbmcgM0QgaXMgaGFwcGVuaW5nIGFuZCB0aGVyZSdzIGEgdHJhbnNmb3JtT3JpZ2luIHdpdGggYSB6IGNvbXBvbmVudCB0aGF0J3Mgbm9uLXplcm8sIHdlIG11c3QgZW5zdXJlIHRoYXQgdGhlIHRyYW5zZm9ybU9yaWdpbidzIHotY29tcG9uZW50IGlzIHNldCB0byAwIHNvIHRoYXQgd2UgY2FuIG1hbnVhbGx5IGRvIHRob3NlIGNhbGN1bGF0aW9ucyB0byBnZXQgYXJvdW5kIFNhZmFyaSBidWdzLiBFdmVuIGlmIHRoZSB1c2VyIGRpZG4ndCBzcGVjaWZpY2FsbHkgZGVmaW5lIGEgXCJ0cmFuc2Zvcm1PcmlnaW5cIiBpbiB0aGlzIHBhcnRpY3VsYXIgdHdlZW4gKG1heWJlIHRoZXkgZGlkIGl0IHZpYSBjc3MgZGlyZWN0bHkpLlxuXHRcdFx0XHRpZiAoX3RyYW5zZm9ybVByb3ApIHtcblx0XHRcdFx0XHRoYXNDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHRcdHAgPSBfdHJhbnNmb3JtT3JpZ2luUHJvcDtcblx0XHRcdFx0XHRvcmlnID0gKG9yaWcgfHwgX2dldFN0eWxlKHQsIHAsIF9jcywgZmFsc2UsIFwiNTAlIDUwJVwiKSkgKyBcIlwiOyAvL2Nhc3QgYXMgc3RyaW5nIHRvIGF2b2lkIGVycm9yc1xuXHRcdFx0XHRcdHB0ID0gbmV3IENTU1Byb3BUd2VlbihzdHlsZSwgcCwgMCwgMCwgcHQsIC0xLCB0cmFuc2Zvcm1PcmlnaW5TdHJpbmcpO1xuXHRcdFx0XHRcdHB0LmIgPSBzdHlsZVtwXTtcblx0XHRcdFx0XHRwdC5wbHVnaW4gPSBwbHVnaW47XG5cdFx0XHRcdFx0aWYgKF9zdXBwb3J0czNEKSB7XG5cdFx0XHRcdFx0XHRjb3B5ID0gbTEuek9yaWdpbjtcblx0XHRcdFx0XHRcdG9yaWcgPSBvcmlnLnNwbGl0KFwiIFwiKTtcblx0XHRcdFx0XHRcdG0xLnpPcmlnaW4gPSAoKG9yaWcubGVuZ3RoID4gMiAmJiAhKGNvcHkgIT09IDAgJiYgb3JpZ1syXSA9PT0gXCIwcHhcIikpID8gcGFyc2VGbG9hdChvcmlnWzJdKSA6IGNvcHkpIHx8IDA7IC8vU2FmYXJpIGRvZXNuJ3QgaGFuZGxlIHRoZSB6IHBhcnQgb2YgdHJhbnNmb3JtT3JpZ2luIGNvcnJlY3RseSwgc28gd2UnbGwgbWFudWFsbHkgaGFuZGxlIGl0IGluIHRoZSBfc2V0M0RUcmFuc2Zvcm1SYXRpbygpIG1ldGhvZC5cblx0XHRcdFx0XHRcdHB0LnhzMCA9IHB0LmUgPSBvcmlnWzBdICsgXCIgXCIgKyAob3JpZ1sxXSB8fCBcIjUwJVwiKSArIFwiIDBweFwiOyAvL3dlIG11c3QgZGVmaW5lIGEgeiB2YWx1ZSBvZiAwcHggc3BlY2lmaWNhbGx5IG90aGVyd2lzZSBpT1MgNSBTYWZhcmkgd2lsbCBzdGljayB3aXRoIHRoZSBvbGQgb25lIChpZiBvbmUgd2FzIGRlZmluZWQpIVxuXHRcdFx0XHRcdFx0cHQgPSBuZXcgQ1NTUHJvcFR3ZWVuKG0xLCBcInpPcmlnaW5cIiwgMCwgMCwgcHQsIC0xLCBwdC5uKTsgLy93ZSBtdXN0IGNyZWF0ZSBhIENTU1Byb3BUd2VlbiBmb3IgdGhlIF9nc1RyYW5zZm9ybS56T3JpZ2luIHNvIHRoYXQgaXQgZ2V0cyByZXNldCBwcm9wZXJseSBhdCB0aGUgYmVnaW5uaW5nIGlmIHRoZSB0d2VlbiBydW5zIGJhY2t3YXJkIChhcyBvcHBvc2VkIHRvIGp1c3Qgc2V0dGluZyBtMS56T3JpZ2luIGhlcmUpXG5cdFx0XHRcdFx0XHRwdC5iID0gY29weTtcblx0XHRcdFx0XHRcdHB0LnhzMCA9IHB0LmUgPSBtMS56T3JpZ2luO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRwdC54czAgPSBwdC5lID0gb3JpZztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvL2ZvciBvbGRlciB2ZXJzaW9ucyBvZiBJRSAoNi04KSwgd2UgbmVlZCB0byBtYW51YWxseSBjYWxjdWxhdGUgdGhpbmdzIGluc2lkZSB0aGUgc2V0UmF0aW8oKSBmdW5jdGlvbi4gV2UgcmVjb3JkIG9yaWdpbiB4IGFuZCB5IChveCBhbmQgb3kpIGFuZCB3aGV0aGVyIG9yIG5vdCB0aGUgdmFsdWVzIGFyZSBwZXJjZW50YWdlcyAob3hwIGFuZCBveXApLlxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdF9wYXJzZVBvc2l0aW9uKG9yaWcgKyBcIlwiLCBtMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChoYXNDaGFuZ2UpIHtcblx0XHRcdFx0Y3NzcC5fdHJhbnNmb3JtVHlwZSA9ICghKG0xLnN2ZyAmJiBfdXNlU1ZHVHJhbnNmb3JtQXR0cikgJiYgKGhhczNEIHx8IHRoaXMuX3RyYW5zZm9ybVR5cGUgPT09IDMpKSA/IDMgOiAyOyAvL3F1aWNrZXIgdGhhbiBjYWxsaW5nIGNzc3AuX2VuYWJsZVRyYW5zZm9ybXMoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwdDtcblx0XHR9LCBwcmVmaXg6dHJ1ZX0pO1xuXG5cdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKFwiYm94U2hhZG93XCIsIHtkZWZhdWx0VmFsdWU6XCIwcHggMHB4IDBweCAwcHggIzk5OVwiLCBwcmVmaXg6dHJ1ZSwgY29sb3I6dHJ1ZSwgbXVsdGk6dHJ1ZSwga2V5d29yZDpcImluc2V0XCJ9KTtcblxuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcImJvcmRlclJhZGl1c1wiLCB7ZGVmYXVsdFZhbHVlOlwiMHB4XCIsIHBhcnNlcjpmdW5jdGlvbih0LCBlLCBwLCBjc3NwLCBwdCwgcGx1Z2luKSB7XG5cdFx0XHRlID0gdGhpcy5mb3JtYXQoZSk7XG5cdFx0XHR2YXIgcHJvcHMgPSBbXCJib3JkZXJUb3BMZWZ0UmFkaXVzXCIsXCJib3JkZXJUb3BSaWdodFJhZGl1c1wiLFwiYm9yZGVyQm90dG9tUmlnaHRSYWRpdXNcIixcImJvcmRlckJvdHRvbUxlZnRSYWRpdXNcIl0sXG5cdFx0XHRcdHN0eWxlID0gdC5zdHlsZSxcblx0XHRcdFx0ZWExLCBpLCBlczIsIGJzMiwgYnMsIGVzLCBibiwgZW4sIHcsIGgsIGVzZngsIGJzZngsIHJlbCwgaG4sIHZuLCBlbTtcblx0XHRcdHcgPSBwYXJzZUZsb2F0KHQub2Zmc2V0V2lkdGgpO1xuXHRcdFx0aCA9IHBhcnNlRmxvYXQodC5vZmZzZXRIZWlnaHQpO1xuXHRcdFx0ZWExID0gZS5zcGxpdChcIiBcIik7XG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgcHJvcHMubGVuZ3RoOyBpKyspIHsgLy9pZiB3ZSdyZSBkZWFsaW5nIHdpdGggcGVyY2VudGFnZXMsIHdlIG11c3QgY29udmVydCB0aGluZ3Mgc2VwYXJhdGVseSBmb3IgdGhlIGhvcml6b250YWwgYW5kIHZlcnRpY2FsIGF4aXMhXG5cdFx0XHRcdGlmICh0aGlzLnAuaW5kZXhPZihcImJvcmRlclwiKSkgeyAvL29sZGVyIGJyb3dzZXJzIHVzZWQgYSBwcmVmaXhcblx0XHRcdFx0XHRwcm9wc1tpXSA9IF9jaGVja1Byb3BQcmVmaXgocHJvcHNbaV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJzID0gYnMyID0gX2dldFN0eWxlKHQsIHByb3BzW2ldLCBfY3MsIGZhbHNlLCBcIjBweFwiKTtcblx0XHRcdFx0aWYgKGJzLmluZGV4T2YoXCIgXCIpICE9PSAtMSkge1xuXHRcdFx0XHRcdGJzMiA9IGJzLnNwbGl0KFwiIFwiKTtcblx0XHRcdFx0XHRicyA9IGJzMlswXTtcblx0XHRcdFx0XHRiczIgPSBiczJbMV07XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXMgPSBlczIgPSBlYTFbaV07XG5cdFx0XHRcdGJuID0gcGFyc2VGbG9hdChicyk7XG5cdFx0XHRcdGJzZnggPSBicy5zdWJzdHIoKGJuICsgXCJcIikubGVuZ3RoKTtcblx0XHRcdFx0cmVsID0gKGVzLmNoYXJBdCgxKSA9PT0gXCI9XCIpO1xuXHRcdFx0XHRpZiAocmVsKSB7XG5cdFx0XHRcdFx0ZW4gPSBwYXJzZUludChlcy5jaGFyQXQoMCkrXCIxXCIsIDEwKTtcblx0XHRcdFx0XHRlcyA9IGVzLnN1YnN0cigyKTtcblx0XHRcdFx0XHRlbiAqPSBwYXJzZUZsb2F0KGVzKTtcblx0XHRcdFx0XHRlc2Z4ID0gZXMuc3Vic3RyKChlbiArIFwiXCIpLmxlbmd0aCAtIChlbiA8IDAgPyAxIDogMCkpIHx8IFwiXCI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW4gPSBwYXJzZUZsb2F0KGVzKTtcblx0XHRcdFx0XHRlc2Z4ID0gZXMuc3Vic3RyKChlbiArIFwiXCIpLmxlbmd0aCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVzZnggPT09IFwiXCIpIHtcblx0XHRcdFx0XHRlc2Z4ID0gX3N1ZmZpeE1hcFtwXSB8fCBic2Z4O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlc2Z4ICE9PSBic2Z4KSB7XG5cdFx0XHRcdFx0aG4gPSBfY29udmVydFRvUGl4ZWxzKHQsIFwiYm9yZGVyTGVmdFwiLCBibiwgYnNmeCk7IC8vaG9yaXpvbnRhbCBudW1iZXIgKHdlIHVzZSBhIGJvZ3VzIFwiYm9yZGVyTGVmdFwiIHByb3BlcnR5IGp1c3QgYmVjYXVzZSB0aGUgX2NvbnZlcnRUb1BpeGVscygpIG1ldGhvZCBzZWFyY2hlcyBmb3IgdGhlIGtleXdvcmRzIFwiTGVmdFwiLCBcIlJpZ2h0XCIsIFwiVG9wXCIsIGFuZCBcIkJvdHRvbVwiIHRvIGRldGVybWluZSBvZiBpdCdzIGEgaG9yaXpvbnRhbCBvciB2ZXJ0aWNhbCBwcm9wZXJ0eSwgYW5kIHdlIG5lZWQgXCJib3JkZXJcIiBpbiB0aGUgbmFtZSBzbyB0aGF0IGl0IGtub3dzIGl0IHNob3VsZCBtZWFzdXJlIHJlbGF0aXZlIHRvIHRoZSBlbGVtZW50IGl0c2VsZiwgbm90IGl0cyBwYXJlbnQuXG5cdFx0XHRcdFx0dm4gPSBfY29udmVydFRvUGl4ZWxzKHQsIFwiYm9yZGVyVG9wXCIsIGJuLCBic2Z4KTsgLy92ZXJ0aWNhbCBudW1iZXJcblx0XHRcdFx0XHRpZiAoZXNmeCA9PT0gXCIlXCIpIHtcblx0XHRcdFx0XHRcdGJzID0gKGhuIC8gdyAqIDEwMCkgKyBcIiVcIjtcblx0XHRcdFx0XHRcdGJzMiA9ICh2biAvIGggKiAxMDApICsgXCIlXCI7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChlc2Z4ID09PSBcImVtXCIpIHtcblx0XHRcdFx0XHRcdGVtID0gX2NvbnZlcnRUb1BpeGVscyh0LCBcImJvcmRlckxlZnRcIiwgMSwgXCJlbVwiKTtcblx0XHRcdFx0XHRcdGJzID0gKGhuIC8gZW0pICsgXCJlbVwiO1xuXHRcdFx0XHRcdFx0YnMyID0gKHZuIC8gZW0pICsgXCJlbVwiO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRicyA9IGhuICsgXCJweFwiO1xuXHRcdFx0XHRcdFx0YnMyID0gdm4gKyBcInB4XCI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChyZWwpIHtcblx0XHRcdFx0XHRcdGVzID0gKHBhcnNlRmxvYXQoYnMpICsgZW4pICsgZXNmeDtcblx0XHRcdFx0XHRcdGVzMiA9IChwYXJzZUZsb2F0KGJzMikgKyBlbikgKyBlc2Z4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRwdCA9IF9wYXJzZUNvbXBsZXgoc3R5bGUsIHByb3BzW2ldLCBicyArIFwiIFwiICsgYnMyLCBlcyArIFwiIFwiICsgZXMyLCBmYWxzZSwgXCIwcHhcIiwgcHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHB0O1xuXHRcdH0sIHByZWZpeDp0cnVlLCBmb3JtYXR0ZXI6X2dldEZvcm1hdHRlcihcIjBweCAwcHggMHB4IDBweFwiLCBmYWxzZSwgdHJ1ZSl9KTtcblx0XHRfcmVnaXN0ZXJDb21wbGV4U3BlY2lhbFByb3AoXCJiYWNrZ3JvdW5kUG9zaXRpb25cIiwge2RlZmF1bHRWYWx1ZTpcIjAgMFwiLCBwYXJzZXI6ZnVuY3Rpb24odCwgZSwgcCwgY3NzcCwgcHQsIHBsdWdpbikge1xuXHRcdFx0dmFyIGJwID0gXCJiYWNrZ3JvdW5kLXBvc2l0aW9uXCIsXG5cdFx0XHRcdGNzID0gKF9jcyB8fCBfZ2V0Q29tcHV0ZWRTdHlsZSh0LCBudWxsKSksXG5cdFx0XHRcdGJzID0gdGhpcy5mb3JtYXQoICgoY3MpID8gX2llVmVycyA/IGNzLmdldFByb3BlcnR5VmFsdWUoYnAgKyBcIi14XCIpICsgXCIgXCIgKyBjcy5nZXRQcm9wZXJ0eVZhbHVlKGJwICsgXCIteVwiKSA6IGNzLmdldFByb3BlcnR5VmFsdWUoYnApIDogdC5jdXJyZW50U3R5bGUuYmFja2dyb3VuZFBvc2l0aW9uWCArIFwiIFwiICsgdC5jdXJyZW50U3R5bGUuYmFja2dyb3VuZFBvc2l0aW9uWSkgfHwgXCIwIDBcIiksIC8vSW50ZXJuZXQgRXhwbG9yZXIgZG9lc24ndCByZXBvcnQgYmFja2dyb3VuZC1wb3NpdGlvbiBjb3JyZWN0bHkgLSB3ZSBtdXN0IHF1ZXJ5IGJhY2tncm91bmQtcG9zaXRpb24teCBhbmQgYmFja2dyb3VuZC1wb3NpdGlvbi15IGFuZCBjb21iaW5lIHRoZW0gKGV2ZW4gaW4gSUUxMCkuIEJlZm9yZSBJRTksIHdlIG11c3QgZG8gdGhlIHNhbWUgd2l0aCB0aGUgY3VycmVudFN0eWxlIG9iamVjdCBhbmQgdXNlIGNhbWVsQ2FzZVxuXHRcdFx0XHRlcyA9IHRoaXMuZm9ybWF0KGUpLFxuXHRcdFx0XHRiYSwgZWEsIGksIHBjdCwgb3ZlcmxhcCwgc3JjO1xuXHRcdFx0aWYgKChicy5pbmRleE9mKFwiJVwiKSAhPT0gLTEpICE9PSAoZXMuaW5kZXhPZihcIiVcIikgIT09IC0xKSkge1xuXHRcdFx0XHRzcmMgPSBfZ2V0U3R5bGUodCwgXCJiYWNrZ3JvdW5kSW1hZ2VcIikucmVwbGFjZShfdXJsRXhwLCBcIlwiKTtcblx0XHRcdFx0aWYgKHNyYyAmJiBzcmMgIT09IFwibm9uZVwiKSB7XG5cdFx0XHRcdFx0YmEgPSBicy5zcGxpdChcIiBcIik7XG5cdFx0XHRcdFx0ZWEgPSBlcy5zcGxpdChcIiBcIik7XG5cdFx0XHRcdFx0X3RlbXBJbWcuc2V0QXR0cmlidXRlKFwic3JjXCIsIHNyYyk7IC8vc2V0IHRoZSB0ZW1wIElNRydzIHNyYyB0byB0aGUgYmFja2dyb3VuZC1pbWFnZSBzbyB0aGF0IHdlIGNhbiBtZWFzdXJlIGl0cyB3aWR0aC9oZWlnaHRcblx0XHRcdFx0XHRpID0gMjtcblx0XHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHRcdGJzID0gYmFbaV07XG5cdFx0XHRcdFx0XHRwY3QgPSAoYnMuaW5kZXhPZihcIiVcIikgIT09IC0xKTtcblx0XHRcdFx0XHRcdGlmIChwY3QgIT09IChlYVtpXS5pbmRleE9mKFwiJVwiKSAhPT0gLTEpKSB7XG5cdFx0XHRcdFx0XHRcdG92ZXJsYXAgPSAoaSA9PT0gMCkgPyB0Lm9mZnNldFdpZHRoIC0gX3RlbXBJbWcud2lkdGggOiB0Lm9mZnNldEhlaWdodCAtIF90ZW1wSW1nLmhlaWdodDtcblx0XHRcdFx0XHRcdFx0YmFbaV0gPSBwY3QgPyAocGFyc2VGbG9hdChicykgLyAxMDAgKiBvdmVybGFwKSArIFwicHhcIiA6IChwYXJzZUZsb2F0KGJzKSAvIG92ZXJsYXAgKiAxMDApICsgXCIlXCI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJzID0gYmEuam9pbihcIiBcIik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnBhcnNlQ29tcGxleCh0LnN0eWxlLCBicywgZXMsIHB0LCBwbHVnaW4pO1xuXHRcdH0sIGZvcm1hdHRlcjpfcGFyc2VQb3NpdGlvbn0pO1xuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcImJhY2tncm91bmRTaXplXCIsIHtkZWZhdWx0VmFsdWU6XCIwIDBcIiwgZm9ybWF0dGVyOl9wYXJzZVBvc2l0aW9ufSk7XG5cdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKFwicGVyc3BlY3RpdmVcIiwge2RlZmF1bHRWYWx1ZTpcIjBweFwiLCBwcmVmaXg6dHJ1ZX0pO1xuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcInBlcnNwZWN0aXZlT3JpZ2luXCIsIHtkZWZhdWx0VmFsdWU6XCI1MCUgNTAlXCIsIHByZWZpeDp0cnVlfSk7XG5cdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKFwidHJhbnNmb3JtU3R5bGVcIiwge3ByZWZpeDp0cnVlfSk7XG5cdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKFwiYmFja2ZhY2VWaXNpYmlsaXR5XCIsIHtwcmVmaXg6dHJ1ZX0pO1xuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcInVzZXJTZWxlY3RcIiwge3ByZWZpeDp0cnVlfSk7XG5cdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKFwibWFyZ2luXCIsIHtwYXJzZXI6X2dldEVkZ2VQYXJzZXIoXCJtYXJnaW5Ub3AsbWFyZ2luUmlnaHQsbWFyZ2luQm90dG9tLG1hcmdpbkxlZnRcIil9KTtcblx0XHRfcmVnaXN0ZXJDb21wbGV4U3BlY2lhbFByb3AoXCJwYWRkaW5nXCIsIHtwYXJzZXI6X2dldEVkZ2VQYXJzZXIoXCJwYWRkaW5nVG9wLHBhZGRpbmdSaWdodCxwYWRkaW5nQm90dG9tLHBhZGRpbmdMZWZ0XCIpfSk7XG5cdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKFwiY2xpcFwiLCB7ZGVmYXVsdFZhbHVlOlwicmVjdCgwcHgsMHB4LDBweCwwcHgpXCIsIHBhcnNlcjpmdW5jdGlvbih0LCBlLCBwLCBjc3NwLCBwdCwgcGx1Z2luKXtcblx0XHRcdHZhciBiLCBjcywgZGVsaW07XG5cdFx0XHRpZiAoX2llVmVycyA8IDkpIHsgLy9JRTggYW5kIGVhcmxpZXIgZG9uJ3QgcmVwb3J0IGEgXCJjbGlwXCIgdmFsdWUgaW4gdGhlIGN1cnJlbnRTdHlsZSAtIGluc3RlYWQsIHRoZSB2YWx1ZXMgYXJlIHNwbGl0IGFwYXJ0IGludG8gY2xpcFRvcCwgY2xpcFJpZ2h0LCBjbGlwQm90dG9tLCBhbmQgY2xpcExlZnQuIEFsc28sIGluIElFNyBhbmQgZWFybGllciwgdGhlIHZhbHVlcyBpbnNpZGUgcmVjdCgpIGFyZSBzcGFjZS1kZWxpbWl0ZWQsIG5vdCBjb21tYS1kZWxpbWl0ZWQuXG5cdFx0XHRcdGNzID0gdC5jdXJyZW50U3R5bGU7XG5cdFx0XHRcdGRlbGltID0gX2llVmVycyA8IDggPyBcIiBcIiA6IFwiLFwiO1xuXHRcdFx0XHRiID0gXCJyZWN0KFwiICsgY3MuY2xpcFRvcCArIGRlbGltICsgY3MuY2xpcFJpZ2h0ICsgZGVsaW0gKyBjcy5jbGlwQm90dG9tICsgZGVsaW0gKyBjcy5jbGlwTGVmdCArIFwiKVwiO1xuXHRcdFx0XHRlID0gdGhpcy5mb3JtYXQoZSkuc3BsaXQoXCIsXCIpLmpvaW4oZGVsaW0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YiA9IHRoaXMuZm9ybWF0KF9nZXRTdHlsZSh0LCB0aGlzLnAsIF9jcywgZmFsc2UsIHRoaXMuZGZsdCkpO1xuXHRcdFx0XHRlID0gdGhpcy5mb3JtYXQoZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJzZUNvbXBsZXgodC5zdHlsZSwgYiwgZSwgcHQsIHBsdWdpbik7XG5cdFx0fX0pO1xuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcInRleHRTaGFkb3dcIiwge2RlZmF1bHRWYWx1ZTpcIjBweCAwcHggMHB4ICM5OTlcIiwgY29sb3I6dHJ1ZSwgbXVsdGk6dHJ1ZX0pO1xuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcImF1dG9Sb3VuZCxzdHJpY3RVbml0c1wiLCB7cGFyc2VyOmZ1bmN0aW9uKHQsIGUsIHAsIGNzc3AsIHB0KSB7cmV0dXJuIHB0O319KTsgLy9qdXN0IHNvIHRoYXQgd2UgY2FuIGlnbm9yZSB0aGVzZSBwcm9wZXJ0aWVzIChub3QgdHdlZW4gdGhlbSlcblx0XHRfcmVnaXN0ZXJDb21wbGV4U3BlY2lhbFByb3AoXCJib3JkZXJcIiwge2RlZmF1bHRWYWx1ZTpcIjBweCBzb2xpZCAjMDAwXCIsIHBhcnNlcjpmdW5jdGlvbih0LCBlLCBwLCBjc3NwLCBwdCwgcGx1Z2luKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnBhcnNlQ29tcGxleCh0LnN0eWxlLCB0aGlzLmZvcm1hdChfZ2V0U3R5bGUodCwgXCJib3JkZXJUb3BXaWR0aFwiLCBfY3MsIGZhbHNlLCBcIjBweFwiKSArIFwiIFwiICsgX2dldFN0eWxlKHQsIFwiYm9yZGVyVG9wU3R5bGVcIiwgX2NzLCBmYWxzZSwgXCJzb2xpZFwiKSArIFwiIFwiICsgX2dldFN0eWxlKHQsIFwiYm9yZGVyVG9wQ29sb3JcIiwgX2NzLCBmYWxzZSwgXCIjMDAwXCIpKSwgdGhpcy5mb3JtYXQoZSksIHB0LCBwbHVnaW4pO1xuXHRcdFx0fSwgY29sb3I6dHJ1ZSwgZm9ybWF0dGVyOmZ1bmN0aW9uKHYpIHtcblx0XHRcdFx0dmFyIGEgPSB2LnNwbGl0KFwiIFwiKTtcblx0XHRcdFx0cmV0dXJuIGFbMF0gKyBcIiBcIiArIChhWzFdIHx8IFwic29saWRcIikgKyBcIiBcIiArICh2Lm1hdGNoKF9jb2xvckV4cCkgfHwgW1wiIzAwMFwiXSlbMF07XG5cdFx0XHR9fSk7XG5cdFx0X3JlZ2lzdGVyQ29tcGxleFNwZWNpYWxQcm9wKFwiYm9yZGVyV2lkdGhcIiwge3BhcnNlcjpfZ2V0RWRnZVBhcnNlcihcImJvcmRlclRvcFdpZHRoLGJvcmRlclJpZ2h0V2lkdGgsYm9yZGVyQm90dG9tV2lkdGgsYm9yZGVyTGVmdFdpZHRoXCIpfSk7IC8vRmlyZWZveCBkb2Vzbid0IHBpY2sgdXAgb24gYm9yZGVyV2lkdGggc2V0IGluIHN0eWxlIHNoZWV0cyAob25seSBpbmxpbmUpLlxuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcImZsb2F0LGNzc0Zsb2F0LHN0eWxlRmxvYXRcIiwge3BhcnNlcjpmdW5jdGlvbih0LCBlLCBwLCBjc3NwLCBwdCwgcGx1Z2luKSB7XG5cdFx0XHR2YXIgcyA9IHQuc3R5bGUsXG5cdFx0XHRcdHByb3AgPSAoXCJjc3NGbG9hdFwiIGluIHMpID8gXCJjc3NGbG9hdFwiIDogXCJzdHlsZUZsb2F0XCI7XG5cdFx0XHRyZXR1cm4gbmV3IENTU1Byb3BUd2VlbihzLCBwcm9wLCAwLCAwLCBwdCwgLTEsIHAsIGZhbHNlLCAwLCBzW3Byb3BdLCBlKTtcblx0XHR9fSk7XG5cblx0XHQvL29wYWNpdHktcmVsYXRlZFxuXHRcdHZhciBfc2V0SUVPcGFjaXR5UmF0aW8gPSBmdW5jdGlvbih2KSB7XG5cdFx0XHRcdHZhciB0ID0gdGhpcy50LCAvL3JlZmVycyB0byB0aGUgZWxlbWVudCdzIHN0eWxlIHByb3BlcnR5XG5cdFx0XHRcdFx0ZmlsdGVycyA9IHQuZmlsdGVyIHx8IF9nZXRTdHlsZSh0aGlzLmRhdGEsIFwiZmlsdGVyXCIpIHx8IFwiXCIsXG5cdFx0XHRcdFx0dmFsID0gKHRoaXMucyArIHRoaXMuYyAqIHYpIHwgMCxcblx0XHRcdFx0XHRza2lwO1xuXHRcdFx0XHRpZiAodmFsID09PSAxMDApIHsgLy9mb3Igb2xkZXIgdmVyc2lvbnMgb2YgSUUgdGhhdCBuZWVkIHRvIHVzZSBhIGZpbHRlciB0byBhcHBseSBvcGFjaXR5LCB3ZSBzaG91bGQgcmVtb3ZlIHRoZSBmaWx0ZXIgaWYgb3BhY2l0eSBoaXRzIDEgaW4gb3JkZXIgdG8gaW1wcm92ZSBwZXJmb3JtYW5jZSwgYnV0IG1ha2Ugc3VyZSB0aGVyZSBpc24ndCBhIHRyYW5zZm9ybSAobWF0cml4KSBvciBncmFkaWVudCBpbiB0aGUgZmlsdGVycy5cblx0XHRcdFx0XHRpZiAoZmlsdGVycy5pbmRleE9mKFwiYXRyaXgoXCIpID09PSAtMSAmJiBmaWx0ZXJzLmluZGV4T2YoXCJyYWRpZW50KFwiKSA9PT0gLTEgJiYgZmlsdGVycy5pbmRleE9mKFwib2FkZXIoXCIpID09PSAtMSkge1xuXHRcdFx0XHRcdFx0dC5yZW1vdmVBdHRyaWJ1dGUoXCJmaWx0ZXJcIik7XG5cdFx0XHRcdFx0XHRza2lwID0gKCFfZ2V0U3R5bGUodGhpcy5kYXRhLCBcImZpbHRlclwiKSk7IC8vaWYgYSBjbGFzcyBpcyBhcHBsaWVkIHRoYXQgaGFzIGFuIGFscGhhIGZpbHRlciwgaXQgd2lsbCB0YWtlIGVmZmVjdCAod2UgZG9uJ3Qgd2FudCB0aGF0KSwgc28gcmUtYXBwbHkgb3VyIGFscGhhIGZpbHRlciBpbiB0aGF0IGNhc2UuIFdlIG11c3QgZmlyc3QgcmVtb3ZlIGl0IGFuZCB0aGVuIGNoZWNrLlxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0LmZpbHRlciA9IGZpbHRlcnMucmVwbGFjZShfYWxwaGFGaWx0ZXJFeHAsIFwiXCIpO1xuXHRcdFx0XHRcdFx0c2tpcCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghc2tpcCkge1xuXHRcdFx0XHRcdGlmICh0aGlzLnhuMSkge1xuXHRcdFx0XHRcdFx0dC5maWx0ZXIgPSBmaWx0ZXJzID0gZmlsdGVycyB8fCAoXCJhbHBoYShvcGFjaXR5PVwiICsgdmFsICsgXCIpXCIpOyAvL3dvcmtzIGFyb3VuZCBidWcgaW4gSUU3LzggdGhhdCBwcmV2ZW50cyBjaGFuZ2VzIHRvIFwidmlzaWJpbGl0eVwiIGZyb20gYmVpbmcgYXBwbGllZCBwcm9wZXJseSBpZiB0aGUgZmlsdGVyIGlzIGNoYW5nZWQgdG8gYSBkaWZmZXJlbnQgYWxwaGEgb24gdGhlIHNhbWUgZnJhbWUuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChmaWx0ZXJzLmluZGV4T2YoXCJwYWNpdHlcIikgPT09IC0xKSB7IC8vb25seSB1c2VkIGlmIGJyb3dzZXIgZG9lc24ndCBzdXBwb3J0IHRoZSBzdGFuZGFyZCBvcGFjaXR5IHN0eWxlIHByb3BlcnR5IChJRSA3IGFuZCA4KS4gV2Ugb21pdCB0aGUgXCJPXCIgdG8gYXZvaWQgY2FzZS1zZW5zaXRpdml0eSBpc3N1ZXNcblx0XHRcdFx0XHRcdGlmICh2YWwgIT09IDAgfHwgIXRoaXMueG4xKSB7IC8vYnVncyBpbiBJRTcvOCB3b24ndCByZW5kZXIgdGhlIGZpbHRlciBwcm9wZXJseSBpZiBvcGFjaXR5IGlzIEFEREVEIG9uIHRoZSBzYW1lIGZyYW1lL3JlbmRlciBhcyBcInZpc2liaWxpdHlcIiBjaGFuZ2VzICh0aGlzLnhuMSBpcyAxIGlmIHRoaXMgdHdlZW4gaXMgYW4gXCJhdXRvQWxwaGFcIiB0d2Vlbilcblx0XHRcdFx0XHRcdFx0dC5maWx0ZXIgPSBmaWx0ZXJzICsgXCIgYWxwaGEob3BhY2l0eT1cIiArIHZhbCArIFwiKVwiOyAvL3dlIHJvdW5kIHRoZSB2YWx1ZSBiZWNhdXNlIG90aGVyd2lzZSwgYnVncyBpbiBJRTcvOCBjYW4gcHJldmVudCBcInZpc2liaWxpdHlcIiBjaGFuZ2VzIGZyb20gYmVpbmcgYXBwbGllZCBwcm9wZXJseS5cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dC5maWx0ZXIgPSBmaWx0ZXJzLnJlcGxhY2UoX29wYWNpdHlFeHAsIFwib3BhY2l0eT1cIiArIHZhbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcIm9wYWNpdHksYWxwaGEsYXV0b0FscGhhXCIsIHtkZWZhdWx0VmFsdWU6XCIxXCIsIHBhcnNlcjpmdW5jdGlvbih0LCBlLCBwLCBjc3NwLCBwdCwgcGx1Z2luKSB7XG5cdFx0XHR2YXIgYiA9IHBhcnNlRmxvYXQoX2dldFN0eWxlKHQsIFwib3BhY2l0eVwiLCBfY3MsIGZhbHNlLCBcIjFcIikpLFxuXHRcdFx0XHRzdHlsZSA9IHQuc3R5bGUsXG5cdFx0XHRcdGlzQXV0b0FscGhhID0gKHAgPT09IFwiYXV0b0FscGhhXCIpO1xuXHRcdFx0aWYgKHR5cGVvZihlKSA9PT0gXCJzdHJpbmdcIiAmJiBlLmNoYXJBdCgxKSA9PT0gXCI9XCIpIHtcblx0XHRcdFx0ZSA9ICgoZS5jaGFyQXQoMCkgPT09IFwiLVwiKSA/IC0xIDogMSkgKiBwYXJzZUZsb2F0KGUuc3Vic3RyKDIpKSArIGI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBdXRvQWxwaGEgJiYgYiA9PT0gMSAmJiBfZ2V0U3R5bGUodCwgXCJ2aXNpYmlsaXR5XCIsIF9jcykgPT09IFwiaGlkZGVuXCIgJiYgZSAhPT0gMCkgeyAvL2lmIHZpc2liaWxpdHkgaXMgaW5pdGlhbGx5IHNldCB0byBcImhpZGRlblwiLCB3ZSBzaG91bGQgaW50ZXJwcmV0IHRoYXQgYXMgaW50ZW50IHRvIG1ha2Ugb3BhY2l0eSAwIChhIGNvbnZlbmllbmNlKVxuXHRcdFx0XHRiID0gMDtcblx0XHRcdH1cblx0XHRcdGlmIChfc3VwcG9ydHNPcGFjaXR5KSB7XG5cdFx0XHRcdHB0ID0gbmV3IENTU1Byb3BUd2VlbihzdHlsZSwgXCJvcGFjaXR5XCIsIGIsIGUgLSBiLCBwdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwdCA9IG5ldyBDU1NQcm9wVHdlZW4oc3R5bGUsIFwib3BhY2l0eVwiLCBiICogMTAwLCAoZSAtIGIpICogMTAwLCBwdCk7XG5cdFx0XHRcdHB0LnhuMSA9IGlzQXV0b0FscGhhID8gMSA6IDA7IC8vd2UgbmVlZCB0byByZWNvcmQgd2hldGhlciBvciBub3QgdGhpcyBpcyBhbiBhdXRvQWxwaGEgc28gdGhhdCBpbiB0aGUgc2V0UmF0aW8oKSwgd2Uga25vdyB0byBkdXBsaWNhdGUgdGhlIHNldHRpbmcgb2YgdGhlIGFscGhhIGluIG9yZGVyIHRvIHdvcmsgYXJvdW5kIGEgYnVnIGluIElFNyBhbmQgSUU4IHRoYXQgcHJldmVudHMgY2hhbmdlcyB0byBcInZpc2liaWxpdHlcIiBmcm9tIHRha2luZyBlZmZlY3QgaWYgdGhlIGZpbHRlciBpcyBjaGFuZ2VkIHRvIGEgZGlmZmVyZW50IGFscGhhKG9wYWNpdHkpIGF0IHRoZSBzYW1lIHRpbWUuIFNldHRpbmcgaXQgdG8gdGhlIFNBTUUgdmFsdWUgZmlyc3QsIHRoZW4gdGhlIG5ldyB2YWx1ZSB3b3JrcyBhcm91bmQgdGhlIElFNy84IGJ1Zy5cblx0XHRcdFx0c3R5bGUuem9vbSA9IDE7IC8vaGVscHMgY29ycmVjdCBhbiBJRSBpc3N1ZS5cblx0XHRcdFx0cHQudHlwZSA9IDI7XG5cdFx0XHRcdHB0LmIgPSBcImFscGhhKG9wYWNpdHk9XCIgKyBwdC5zICsgXCIpXCI7XG5cdFx0XHRcdHB0LmUgPSBcImFscGhhKG9wYWNpdHk9XCIgKyAocHQucyArIHB0LmMpICsgXCIpXCI7XG5cdFx0XHRcdHB0LmRhdGEgPSB0O1xuXHRcdFx0XHRwdC5wbHVnaW4gPSBwbHVnaW47XG5cdFx0XHRcdHB0LnNldFJhdGlvID0gX3NldElFT3BhY2l0eVJhdGlvO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQXV0b0FscGhhKSB7IC8vd2UgaGF2ZSB0byBjcmVhdGUgdGhlIFwidmlzaWJpbGl0eVwiIFByb3BUd2VlbiBhZnRlciB0aGUgb3BhY2l0eSBvbmUgaW4gdGhlIGxpbmtlZCBsaXN0IHNvIHRoYXQgdGhleSBydW4gaW4gdGhlIG9yZGVyIHRoYXQgd29ya3MgcHJvcGVybHkgaW4gSUU4IGFuZCBlYXJsaWVyXG5cdFx0XHRcdHB0ID0gbmV3IENTU1Byb3BUd2VlbihzdHlsZSwgXCJ2aXNpYmlsaXR5XCIsIDAsIDAsIHB0LCAtMSwgbnVsbCwgZmFsc2UsIDAsICgoYiAhPT0gMCkgPyBcImluaGVyaXRcIiA6IFwiaGlkZGVuXCIpLCAoKGUgPT09IDApID8gXCJoaWRkZW5cIiA6IFwiaW5oZXJpdFwiKSk7XG5cdFx0XHRcdHB0LnhzMCA9IFwiaW5oZXJpdFwiO1xuXHRcdFx0XHRjc3NwLl9vdmVyd3JpdGVQcm9wcy5wdXNoKHB0Lm4pO1xuXHRcdFx0XHRjc3NwLl9vdmVyd3JpdGVQcm9wcy5wdXNoKHApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHB0O1xuXHRcdH19KTtcblxuXG5cdFx0dmFyIF9yZW1vdmVQcm9wID0gZnVuY3Rpb24ocywgcCkge1xuXHRcdFx0XHRpZiAocCkge1xuXHRcdFx0XHRcdGlmIChzLnJlbW92ZVByb3BlcnR5KSB7XG5cdFx0XHRcdFx0XHRpZiAocC5zdWJzdHIoMCwyKSA9PT0gXCJtc1wiIHx8IHAuc3Vic3RyKDAsNikgPT09IFwid2Via2l0XCIpIHsgLy9NaWNyb3NvZnQgYW5kIHNvbWUgV2Via2l0IGJyb3dzZXJzIGRvbid0IGNvbmZvcm0gdG8gdGhlIHN0YW5kYXJkIG9mIGNhcGl0YWxpemluZyB0aGUgZmlyc3QgcHJlZml4IGNoYXJhY3Rlciwgc28gd2UgYWRqdXN0IHNvIHRoYXQgd2hlbiB3ZSBwcmVmaXggdGhlIGNhcHMgd2l0aCBhIGRhc2gsIGl0J3MgY29ycmVjdCAob3RoZXJ3aXNlIGl0J2QgYmUgXCJtcy10cmFuc2Zvcm1cIiBpbnN0ZWFkIG9mIFwiLW1zLXRyYW5zZm9ybVwiIGZvciBJRTksIGZvciBleGFtcGxlKVxuXHRcdFx0XHRcdFx0XHRwID0gXCItXCIgKyBwO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cy5yZW1vdmVQcm9wZXJ0eShwLnJlcGxhY2UoX2NhcHNFeHAsIFwiLSQxXCIpLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7IC8vbm90ZTogb2xkIHZlcnNpb25zIG9mIElFIHVzZSBcInJlbW92ZUF0dHJpYnV0ZSgpXCIgaW5zdGVhZCBvZiBcInJlbW92ZVByb3BlcnR5KClcIlxuXHRcdFx0XHRcdFx0cy5yZW1vdmVBdHRyaWJ1dGUocCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0X3NldENsYXNzTmFtZVJhdGlvID0gZnVuY3Rpb24odikge1xuXHRcdFx0XHR0aGlzLnQuX2dzQ2xhc3NQVCA9IHRoaXM7XG5cdFx0XHRcdGlmICh2ID09PSAxIHx8IHYgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLnQuc2V0QXR0cmlidXRlKFwiY2xhc3NcIiwgKHYgPT09IDApID8gdGhpcy5iIDogdGhpcy5lKTtcblx0XHRcdFx0XHR2YXIgbXB0ID0gdGhpcy5kYXRhLCAvL2ZpcnN0IE1pbmlQcm9wVHdlZW5cblx0XHRcdFx0XHRcdHMgPSB0aGlzLnQuc3R5bGU7XG5cdFx0XHRcdFx0d2hpbGUgKG1wdCkge1xuXHRcdFx0XHRcdFx0aWYgKCFtcHQudikge1xuXHRcdFx0XHRcdFx0XHRfcmVtb3ZlUHJvcChzLCBtcHQucCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzW21wdC5wXSA9IG1wdC52O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bXB0ID0gbXB0Ll9uZXh0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodiA9PT0gMSAmJiB0aGlzLnQuX2dzQ2xhc3NQVCA9PT0gdGhpcykge1xuXHRcdFx0XHRcdFx0dGhpcy50Ll9nc0NsYXNzUFQgPSBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLnQuZ2V0QXR0cmlidXRlKFwiY2xhc3NcIikgIT09IHRoaXMuZSkge1xuXHRcdFx0XHRcdHRoaXMudC5zZXRBdHRyaWJ1dGUoXCJjbGFzc1wiLCB0aGlzLmUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcImNsYXNzTmFtZVwiLCB7cGFyc2VyOmZ1bmN0aW9uKHQsIGUsIHAsIGNzc3AsIHB0LCBwbHVnaW4sIHZhcnMpIHtcblx0XHRcdHZhciBiID0gdC5nZXRBdHRyaWJ1dGUoXCJjbGFzc1wiKSB8fCBcIlwiLCAvL2Rvbid0IHVzZSB0LmNsYXNzTmFtZSBiZWNhdXNlIGl0IGRvZXNuJ3Qgd29yayBjb25zaXN0ZW50bHkgb24gU1ZHIGVsZW1lbnRzOyBnZXRBdHRyaWJ1dGUoXCJjbGFzc1wiKSBhbmQgc2V0QXR0cmlidXRlKFwiY2xhc3NcIiwgdmFsdWVcIikgaXMgbW9yZSByZWxpYWJsZS5cblx0XHRcdFx0Y3NzVGV4dCA9IHQuc3R5bGUuY3NzVGV4dCxcblx0XHRcdFx0ZGlmRGF0YSwgYnMsIGNucHQsIGNucHRMb29rdXAsIG1wdDtcblx0XHRcdHB0ID0gY3NzcC5fY2xhc3NOYW1lUFQgPSBuZXcgQ1NTUHJvcFR3ZWVuKHQsIHAsIDAsIDAsIHB0LCAyKTtcblx0XHRcdHB0LnNldFJhdGlvID0gX3NldENsYXNzTmFtZVJhdGlvO1xuXHRcdFx0cHQucHIgPSAtMTE7XG5cdFx0XHRfaGFzUHJpb3JpdHkgPSB0cnVlO1xuXHRcdFx0cHQuYiA9IGI7XG5cdFx0XHRicyA9IF9nZXRBbGxTdHlsZXModCwgX2NzKTtcblx0XHRcdC8vaWYgdGhlcmUncyBhIGNsYXNzTmFtZSB0d2VlbiBhbHJlYWR5IG9wZXJhdGluZyBvbiB0aGUgdGFyZ2V0LCBmb3JjZSBpdCB0byBpdHMgZW5kIHNvIHRoYXQgdGhlIG5lY2Vzc2FyeSBpbmxpbmUgc3R5bGVzIGFyZSByZW1vdmVkIGFuZCB0aGUgY2xhc3MgbmFtZSBpcyBhcHBsaWVkIGJlZm9yZSB3ZSBkZXRlcm1pbmUgdGhlIGVuZCBzdGF0ZSAod2UgZG9uJ3Qgd2FudCBpbmxpbmUgc3R5bGVzIGludGVyZmVyaW5nIHRoYXQgd2VyZSB0aGVyZSBqdXN0IGZvciBjbGFzcy1zcGVjaWZpYyB2YWx1ZXMpXG5cdFx0XHRjbnB0ID0gdC5fZ3NDbGFzc1BUO1xuXHRcdFx0aWYgKGNucHQpIHtcblx0XHRcdFx0Y25wdExvb2t1cCA9IHt9O1xuXHRcdFx0XHRtcHQgPSBjbnB0LmRhdGE7IC8vZmlyc3QgTWluaVByb3BUd2VlbiB3aGljaCBzdG9yZXMgdGhlIGlubGluZSBzdHlsZXMgLSB3ZSBuZWVkIHRvIGZvcmNlIHRoZXNlIHNvIHRoYXQgdGhlIGlubGluZSBzdHlsZXMgZG9uJ3QgY29udGFtaW5hdGUgdGhpbmdzLiBPdGhlcndpc2UsIHRoZXJlJ3MgYSBzbWFsbCBjaGFuY2UgdGhhdCBhIHR3ZWVuIGNvdWxkIHN0YXJ0IGFuZCB0aGUgaW5saW5lIHZhbHVlcyBtYXRjaCB0aGUgZGVzdGluYXRpb24gdmFsdWVzIGFuZCB0aGV5IG5ldmVyIGdldCBjbGVhbmVkLlxuXHRcdFx0XHR3aGlsZSAobXB0KSB7XG5cdFx0XHRcdFx0Y25wdExvb2t1cFttcHQucF0gPSAxO1xuXHRcdFx0XHRcdG1wdCA9IG1wdC5fbmV4dDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjbnB0LnNldFJhdGlvKDEpO1xuXHRcdFx0fVxuXHRcdFx0dC5fZ3NDbGFzc1BUID0gcHQ7XG5cdFx0XHRwdC5lID0gKGUuY2hhckF0KDEpICE9PSBcIj1cIikgPyBlIDogYi5yZXBsYWNlKG5ldyBSZWdFeHAoXCJcXFxccypcXFxcYlwiICsgZS5zdWJzdHIoMikgKyBcIlxcXFxiXCIpLCBcIlwiKSArICgoZS5jaGFyQXQoMCkgPT09IFwiK1wiKSA/IFwiIFwiICsgZS5zdWJzdHIoMikgOiBcIlwiKTtcblx0XHRcdHQuc2V0QXR0cmlidXRlKFwiY2xhc3NcIiwgcHQuZSk7XG5cdFx0XHRkaWZEYXRhID0gX2Nzc0RpZih0LCBicywgX2dldEFsbFN0eWxlcyh0KSwgdmFycywgY25wdExvb2t1cCk7XG5cdFx0XHR0LnNldEF0dHJpYnV0ZShcImNsYXNzXCIsIGIpO1xuXHRcdFx0cHQuZGF0YSA9IGRpZkRhdGEuZmlyc3RNUFQ7XG5cdFx0XHR0LnN0eWxlLmNzc1RleHQgPSBjc3NUZXh0OyAvL3dlIHJlY29yZGVkIGNzc1RleHQgYmVmb3JlIHdlIHN3YXBwZWQgY2xhc3NlcyBhbmQgcmFuIF9nZXRBbGxTdHlsZXMoKSBiZWNhdXNlIGluIGNhc2VzIHdoZW4gYSBjbGFzc05hbWUgdHdlZW4gaXMgb3ZlcndyaXR0ZW4sIHdlIHJlbW92ZSBhbGwgdGhlIHJlbGF0ZWQgdHdlZW5pbmcgcHJvcGVydGllcyBmcm9tIHRoYXQgY2xhc3MgY2hhbmdlIChvdGhlcndpc2UgY2xhc3Mtc3BlY2lmaWMgc3R1ZmYgY2FuJ3Qgb3ZlcnJpZGUgcHJvcGVydGllcyB3ZSd2ZSBkaXJlY3RseSBzZXQgb24gdGhlIHRhcmdldCdzIHN0eWxlIG9iamVjdCBkdWUgdG8gc3BlY2lmaWNpdHkpLlxuXHRcdFx0cHQgPSBwdC54Zmlyc3QgPSBjc3NwLnBhcnNlKHQsIGRpZkRhdGEuZGlmcywgcHQsIHBsdWdpbik7IC8vd2UgcmVjb3JkIHRoZSBDU1NQcm9wVHdlZW4gYXMgdGhlIHhmaXJzdCBzbyB0aGF0IHdlIGNhbiBoYW5kbGUgb3ZlcndyaXRpbmcgcHJvcGVydGx5IChpZiBcImNsYXNzTmFtZVwiIGdldHMgb3ZlcndyaXR0ZW4sIHdlIG11c3Qga2lsbCBhbGwgdGhlIHByb3BlcnRpZXMgYXNzb2NpYXRlZCB3aXRoIHRoZSBjbGFzc05hbWUgcGFydCBvZiB0aGUgdHdlZW4sIHNvIHdlIGNhbiBsb29wIHRocm91Z2ggZnJvbSB4Zmlyc3QgdG8gdGhlIHB0IGl0c2VsZilcblx0XHRcdHJldHVybiBwdDtcblx0XHR9fSk7XG5cblxuXHRcdHZhciBfc2V0Q2xlYXJQcm9wc1JhdGlvID0gZnVuY3Rpb24odikge1xuXHRcdFx0aWYgKHYgPT09IDEgfHwgdiA9PT0gMCkgaWYgKHRoaXMuZGF0YS5fdG90YWxUaW1lID09PSB0aGlzLmRhdGEuX3RvdGFsRHVyYXRpb24gJiYgdGhpcy5kYXRhLmRhdGEgIT09IFwiaXNGcm9tU3RhcnRcIikgeyAvL3RoaXMuZGF0YSByZWZlcnMgdG8gdGhlIHR3ZWVuLiBPbmx5IGNsZWFyIGF0IHRoZSBFTkQgb2YgdGhlIHR3ZWVuIChyZW1lbWJlciwgZnJvbSgpIHR3ZWVucyBtYWtlIHRoZSByYXRpbyBnbyBmcm9tIDEgdG8gMCwgc28gd2UgY2FuJ3QganVzdCBjaGVjayB0aGF0IGFuZCBpZiB0aGUgdHdlZW4gaXMgdGhlIHplcm8tZHVyYXRpb24gb25lIHRoYXQncyBjcmVhdGVkIGludGVybmFsbHkgdG8gcmVuZGVyIHRoZSBzdGFydGluZyB2YWx1ZXMgaW4gYSBmcm9tKCkgdHdlZW4sIGlnbm9yZSB0aGF0IGJlY2F1c2Ugb3RoZXJ3aXNlLCBmb3IgZXhhbXBsZSwgZnJvbSguLi57aGVpZ2h0OjEwMCwgY2xlYXJQcm9wczpcImhlaWdodFwiLCBkZWxheToxfSkgd291bGQgd2lwZSB0aGUgaGVpZ2h0IGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIHR3ZWVuIGFuZCBhZnRlciAxIHNlY29uZCwgaXQnZCBraWNrIGJhY2sgaW4pLlxuXHRcdFx0XHR2YXIgcyA9IHRoaXMudC5zdHlsZSxcblx0XHRcdFx0XHR0cmFuc2Zvcm1QYXJzZSA9IF9zcGVjaWFsUHJvcHMudHJhbnNmb3JtLnBhcnNlLFxuXHRcdFx0XHRcdGEsIHAsIGksIGNsZWFyVHJhbnNmb3JtLCB0cmFuc2Zvcm07XG5cdFx0XHRcdGlmICh0aGlzLmUgPT09IFwiYWxsXCIpIHtcblx0XHRcdFx0XHRzLmNzc1RleHQgPSBcIlwiO1xuXHRcdFx0XHRcdGNsZWFyVHJhbnNmb3JtID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhID0gdGhpcy5lLnNwbGl0KFwiIFwiKS5qb2luKFwiXCIpLnNwbGl0KFwiLFwiKTtcblx0XHRcdFx0XHRpID0gYS5sZW5ndGg7XG5cdFx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0XHRwID0gYVtpXTtcblx0XHRcdFx0XHRcdGlmIChfc3BlY2lhbFByb3BzW3BdKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChfc3BlY2lhbFByb3BzW3BdLnBhcnNlID09PSB0cmFuc2Zvcm1QYXJzZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNsZWFyVHJhbnNmb3JtID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRwID0gKHAgPT09IFwidHJhbnNmb3JtT3JpZ2luXCIpID8gX3RyYW5zZm9ybU9yaWdpblByb3AgOiBfc3BlY2lhbFByb3BzW3BdLnA7IC8vZW5zdXJlcyB0aGF0IHNwZWNpYWwgcHJvcGVydGllcyB1c2UgdGhlIHByb3BlciBicm93c2VyLXNwZWNpZmljIHByb3BlcnR5IG5hbWUsIGxpa2UgXCJzY2FsZVhcIiBtaWdodCBiZSBcIi13ZWJraXQtdHJhbnNmb3JtXCIgb3IgXCJib3hTaGFkb3dcIiBtaWdodCBiZSBcIi1tb3otYm94LXNoYWRvd1wiXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF9yZW1vdmVQcm9wKHMsIHApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2xlYXJUcmFuc2Zvcm0pIHtcblx0XHRcdFx0XHRfcmVtb3ZlUHJvcChzLCBfdHJhbnNmb3JtUHJvcCk7XG5cdFx0XHRcdFx0dHJhbnNmb3JtID0gdGhpcy50Ll9nc1RyYW5zZm9ybTtcblx0XHRcdFx0XHRpZiAodHJhbnNmb3JtKSB7XG5cdFx0XHRcdFx0XHRpZiAodHJhbnNmb3JtLnN2Zykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnQucmVtb3ZlQXR0cmlidXRlKFwiZGF0YS1zdmctb3JpZ2luXCIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMudC5fZ3NUcmFuc2Zvcm07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdH1cblx0XHR9O1xuXHRcdF9yZWdpc3RlckNvbXBsZXhTcGVjaWFsUHJvcChcImNsZWFyUHJvcHNcIiwge3BhcnNlcjpmdW5jdGlvbih0LCBlLCBwLCBjc3NwLCBwdCkge1xuXHRcdFx0cHQgPSBuZXcgQ1NTUHJvcFR3ZWVuKHQsIHAsIDAsIDAsIHB0LCAyKTtcblx0XHRcdHB0LnNldFJhdGlvID0gX3NldENsZWFyUHJvcHNSYXRpbztcblx0XHRcdHB0LmUgPSBlO1xuXHRcdFx0cHQucHIgPSAtMTA7XG5cdFx0XHRwdC5kYXRhID0gY3NzcC5fdHdlZW47XG5cdFx0XHRfaGFzUHJpb3JpdHkgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHB0O1xuXHRcdH19KTtcblxuXHRcdHAgPSBcImJlemllcix0aHJvd1Byb3BzLHBoeXNpY3NQcm9wcyxwaHlzaWNzMkRcIi5zcGxpdChcIixcIik7XG5cdFx0aSA9IHAubGVuZ3RoO1xuXHRcdHdoaWxlIChpLS0pIHtcblx0XHRcdF9yZWdpc3RlclBsdWdpblByb3AocFtpXSk7XG5cdFx0fVxuXG5cblxuXG5cblxuXG5cblx0XHRwID0gQ1NTUGx1Z2luLnByb3RvdHlwZTtcblx0XHRwLl9maXJzdFBUID0gcC5fbGFzdFBhcnNlZFRyYW5zZm9ybSA9IHAuX3RyYW5zZm9ybSA9IG51bGw7XG5cblx0XHQvL2dldHMgY2FsbGVkIHdoZW4gdGhlIHR3ZWVuIHJlbmRlcnMgZm9yIHRoZSBmaXJzdCB0aW1lLiBUaGlzIGtpY2tzIGV2ZXJ5dGhpbmcgb2ZmLCByZWNvcmRpbmcgc3RhcnQvZW5kIHZhbHVlcywgZXRjLlxuXHRcdHAuX29uSW5pdFR3ZWVuID0gZnVuY3Rpb24odGFyZ2V0LCB2YXJzLCB0d2Vlbikge1xuXHRcdFx0aWYgKCF0YXJnZXQubm9kZVR5cGUpIHsgLy9jc3MgaXMgb25seSBmb3IgZG9tIGVsZW1lbnRzXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3RhcmdldCA9IHRhcmdldDtcblx0XHRcdHRoaXMuX3R3ZWVuID0gdHdlZW47XG5cdFx0XHR0aGlzLl92YXJzID0gdmFycztcblx0XHRcdF9hdXRvUm91bmQgPSB2YXJzLmF1dG9Sb3VuZDtcblx0XHRcdF9oYXNQcmlvcml0eSA9IGZhbHNlO1xuXHRcdFx0X3N1ZmZpeE1hcCA9IHZhcnMuc3VmZml4TWFwIHx8IENTU1BsdWdpbi5zdWZmaXhNYXA7XG5cdFx0XHRfY3MgPSBfZ2V0Q29tcHV0ZWRTdHlsZSh0YXJnZXQsIFwiXCIpO1xuXHRcdFx0X292ZXJ3cml0ZVByb3BzID0gdGhpcy5fb3ZlcndyaXRlUHJvcHM7XG5cdFx0XHR2YXIgc3R5bGUgPSB0YXJnZXQuc3R5bGUsXG5cdFx0XHRcdHYsIHB0LCBwdDIsIGZpcnN0LCBsYXN0LCBuZXh0LCB6SW5kZXgsIHRwdCwgdGhyZWVEO1xuXHRcdFx0aWYgKF9yZXFTYWZhcmlGaXgpIGlmIChzdHlsZS56SW5kZXggPT09IFwiXCIpIHtcblx0XHRcdFx0diA9IF9nZXRTdHlsZSh0YXJnZXQsIFwiekluZGV4XCIsIF9jcyk7XG5cdFx0XHRcdGlmICh2ID09PSBcImF1dG9cIiB8fCB2ID09PSBcIlwiKSB7XG5cdFx0XHRcdFx0Ly9jb3JyZWN0cyBhIGJ1ZyBpbiBbbm9uLUFuZHJvaWRdIFNhZmFyaSB0aGF0IHByZXZlbnRzIGl0IGZyb20gcmVwYWludGluZyBlbGVtZW50cyBpbiB0aGVpciBuZXcgcG9zaXRpb25zIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhIHpJbmRleCBzZXQuIFdlIGFsc28gY2FuJ3QganVzdCBhcHBseSB0aGlzIGluc2lkZSBfcGFyc2VUcmFuc2Zvcm0oKSBiZWNhdXNlIGFueXRoaW5nIHRoYXQncyBtb3ZlZCBpbiBhbnkgd2F5IChsaWtlIHVzaW5nIFwibGVmdFwiIG9yIFwidG9wXCIgaW5zdGVhZCBvZiB0cmFuc2Zvcm1zIGxpa2UgXCJ4XCIgYW5kIFwieVwiKSBjYW4gYmUgYWZmZWN0ZWQsIHNvIGl0IGlzIGJlc3QgdG8gZW5zdXJlIHRoYXQgYW55dGhpbmcgdGhhdCdzIHR3ZWVuaW5nIGhhcyBhIHotaW5kZXguIFNldHRpbmcgXCJXZWJraXRQZXJzcGVjdGl2ZVwiIHRvIGEgbm9uLXplcm8gdmFsdWUgd29ya2VkIHRvbyBleGNlcHQgdGhhdCBvbiBpT1MgU2FmYXJpIHRoaW5ncyB3b3VsZCBmbGlja2VyIHJhbmRvbWx5LiBQbHVzIHpJbmRleCBpcyBsZXNzIG1lbW9yeS1pbnRlbnNpdmUuXG5cdFx0XHRcdFx0dGhpcy5fYWRkTGF6eVNldChzdHlsZSwgXCJ6SW5kZXhcIiwgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHR5cGVvZih2YXJzKSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0XHRmaXJzdCA9IHN0eWxlLmNzc1RleHQ7XG5cdFx0XHRcdHYgPSBfZ2V0QWxsU3R5bGVzKHRhcmdldCwgX2NzKTtcblx0XHRcdFx0c3R5bGUuY3NzVGV4dCA9IGZpcnN0ICsgXCI7XCIgKyB2YXJzO1xuXHRcdFx0XHR2ID0gX2Nzc0RpZih0YXJnZXQsIHYsIF9nZXRBbGxTdHlsZXModGFyZ2V0KSkuZGlmcztcblx0XHRcdFx0aWYgKCFfc3VwcG9ydHNPcGFjaXR5ICYmIF9vcGFjaXR5VmFsRXhwLnRlc3QodmFycykpIHtcblx0XHRcdFx0XHR2Lm9wYWNpdHkgPSBwYXJzZUZsb2F0KCBSZWdFeHAuJDEgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR2YXJzID0gdjtcblx0XHRcdFx0c3R5bGUuY3NzVGV4dCA9IGZpcnN0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmFycy5jbGFzc05hbWUpIHsgLy9jbGFzc05hbWUgdHdlZW5zIHdpbGwgY29tYmluZSBhbnkgZGlmZmVyZW5jZXMgdGhleSBmaW5kIGluIHRoZSBjc3Mgd2l0aCB0aGUgdmFycyB0aGF0IGFyZSBwYXNzZWQgaW4sIHNvIHtjbGFzc05hbWU6XCJteUNsYXNzXCIsIHNjYWxlOjAuNSwgbGVmdDoyMH0gd291bGQgd29yay5cblx0XHRcdFx0dGhpcy5fZmlyc3RQVCA9IHB0ID0gX3NwZWNpYWxQcm9wcy5jbGFzc05hbWUucGFyc2UodGFyZ2V0LCB2YXJzLmNsYXNzTmFtZSwgXCJjbGFzc05hbWVcIiwgdGhpcywgbnVsbCwgbnVsbCwgdmFycyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9maXJzdFBUID0gcHQgPSB0aGlzLnBhcnNlKHRhcmdldCwgdmFycywgbnVsbCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl90cmFuc2Zvcm1UeXBlKSB7XG5cdFx0XHRcdHRocmVlRCA9ICh0aGlzLl90cmFuc2Zvcm1UeXBlID09PSAzKTtcblx0XHRcdFx0aWYgKCFfdHJhbnNmb3JtUHJvcCkge1xuXHRcdFx0XHRcdHN0eWxlLnpvb20gPSAxOyAvL2hlbHBzIGNvcnJlY3QgYW4gSUUgaXNzdWUuXG5cdFx0XHRcdH0gZWxzZSBpZiAoX2lzU2FmYXJpKSB7XG5cdFx0XHRcdFx0X3JlcVNhZmFyaUZpeCA9IHRydWU7XG5cdFx0XHRcdFx0Ly9pZiB6SW5kZXggaXNuJ3Qgc2V0LCBpT1MgU2FmYXJpIGRvZXNuJ3QgcmVwYWludCB0aGluZ3MgY29ycmVjdGx5IHNvbWV0aW1lcyAoc2VlbWluZ2x5IGF0IHJhbmRvbSkuXG5cdFx0XHRcdFx0aWYgKHN0eWxlLnpJbmRleCA9PT0gXCJcIikge1xuXHRcdFx0XHRcdFx0ekluZGV4ID0gX2dldFN0eWxlKHRhcmdldCwgXCJ6SW5kZXhcIiwgX2NzKTtcblx0XHRcdFx0XHRcdGlmICh6SW5kZXggPT09IFwiYXV0b1wiIHx8IHpJbmRleCA9PT0gXCJcIikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9hZGRMYXp5U2V0KHN0eWxlLCBcInpJbmRleFwiLCAwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly9TZXR0aW5nIFdlYmtpdEJhY2tmYWNlVmlzaWJpbGl0eSBjb3JyZWN0cyAzIGJ1Z3M6XG5cdFx0XHRcdFx0Ly8gMSkgW25vbi1BbmRyb2lkXSBTYWZhcmkgc2tpcHMgcmVuZGVyaW5nIGNoYW5nZXMgdG8gXCJ0b3BcIiBhbmQgXCJsZWZ0XCIgdGhhdCBhcmUgbWFkZSBvbiB0aGUgc2FtZSBmcmFtZS9yZW5kZXIgYXMgYSB0cmFuc2Zvcm0gdXBkYXRlLlxuXHRcdFx0XHRcdC8vIDIpIGlPUyBTYWZhcmkgc29tZXRpbWVzIG5lZ2xlY3RzIHRvIHJlcGFpbnQgZWxlbWVudHMgaW4gdGhlaXIgbmV3IHBvc2l0aW9ucy4gU2V0dGluZyBcIldlYmtpdFBlcnNwZWN0aXZlXCIgdG8gYSBub24temVybyB2YWx1ZSB3b3JrZWQgdG9vIGV4Y2VwdCB0aGF0IG9uIGlPUyBTYWZhcmkgdGhpbmdzIHdvdWxkIGZsaWNrZXIgcmFuZG9tbHkuXG5cdFx0XHRcdFx0Ly8gMykgU2FmYXJpIHNvbWV0aW1lcyBkaXNwbGF5ZWQgb2RkIGFydGlmYWN0cyB3aGVuIHR3ZWVuaW5nIHRoZSB0cmFuc2Zvcm0gKG9yIFdlYmtpdFRyYW5zZm9ybSkgcHJvcGVydHksIGxpa2UgZ2hvc3RzIG9mIHRoZSBlZGdlcyBvZiB0aGUgZWxlbWVudCByZW1haW5lZC4gRGVmaW5pdGVseSBhIGJyb3dzZXIgYnVnLlxuXHRcdFx0XHRcdC8vTm90ZTogd2UgYWxsb3cgdGhlIHVzZXIgdG8gb3ZlcnJpZGUgdGhlIGF1dG8tc2V0dGluZyBieSBkZWZpbmluZyBXZWJraXRCYWNrZmFjZVZpc2liaWxpdHkgaW4gdGhlIHZhcnMgb2YgdGhlIHR3ZWVuLlxuXHRcdFx0XHRcdGlmIChfaXNTYWZhcmlMVDYpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2FkZExhenlTZXQoc3R5bGUsIFwiV2Via2l0QmFja2ZhY2VWaXNpYmlsaXR5XCIsIHRoaXMuX3ZhcnMuV2Via2l0QmFja2ZhY2VWaXNpYmlsaXR5IHx8ICh0aHJlZUQgPyBcInZpc2libGVcIiA6IFwiaGlkZGVuXCIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cHQyID0gcHQ7XG5cdFx0XHRcdHdoaWxlIChwdDIgJiYgcHQyLl9uZXh0KSB7XG5cdFx0XHRcdFx0cHQyID0gcHQyLl9uZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRwdCA9IG5ldyBDU1NQcm9wVHdlZW4odGFyZ2V0LCBcInRyYW5zZm9ybVwiLCAwLCAwLCBudWxsLCAyKTtcblx0XHRcdFx0dGhpcy5fbGlua0NTU1AodHB0LCBudWxsLCBwdDIpO1xuXHRcdFx0XHR0cHQuc2V0UmF0aW8gPSBfdHJhbnNmb3JtUHJvcCA/IF9zZXRUcmFuc2Zvcm1SYXRpbyA6IF9zZXRJRVRyYW5zZm9ybVJhdGlvO1xuXHRcdFx0XHR0cHQuZGF0YSA9IHRoaXMuX3RyYW5zZm9ybSB8fCBfZ2V0VHJhbnNmb3JtKHRhcmdldCwgX2NzLCB0cnVlKTtcblx0XHRcdFx0dHB0LnR3ZWVuID0gdHdlZW47XG5cdFx0XHRcdHRwdC5wciA9IC0xOyAvL2Vuc3VyZXMgdGhhdCB0aGUgdHJhbnNmb3JtcyBnZXQgYXBwbGllZCBhZnRlciB0aGUgY29tcG9uZW50cyBhcmUgdXBkYXRlZC5cblx0XHRcdFx0X292ZXJ3cml0ZVByb3BzLnBvcCgpOyAvL3dlIGRvbid0IHdhbnQgdG8gZm9yY2UgdGhlIG92ZXJ3cml0ZSBvZiBhbGwgXCJ0cmFuc2Zvcm1cIiB0d2VlbnMgb2YgdGhlIHRhcmdldCAtIHdlIG9ubHkgY2FyZSBhYm91dCBpbmRpdmlkdWFsIHRyYW5zZm9ybSBwcm9wZXJ0aWVzIGxpa2Ugc2NhbGVYLCByb3RhdGlvbiwgZXRjLiBUaGUgQ1NTUHJvcFR3ZWVuIGNvbnN0cnVjdG9yIGF1dG9tYXRpY2FsbHkgYWRkcyB0aGUgcHJvcGVydHkgdG8gX292ZXJ3cml0ZVByb3BzIHdoaWNoIGlzIHdoeSB3ZSBuZWVkIHRvIHBvcCgpIGhlcmUuXG5cdFx0XHR9XG5cblx0XHRcdGlmIChfaGFzUHJpb3JpdHkpIHtcblx0XHRcdFx0Ly9yZW9yZGVycyB0aGUgbGlua2VkIGxpc3QgaW4gb3JkZXIgb2YgcHIgKHByaW9yaXR5KVxuXHRcdFx0XHR3aGlsZSAocHQpIHtcblx0XHRcdFx0XHRuZXh0ID0gcHQuX25leHQ7XG5cdFx0XHRcdFx0cHQyID0gZmlyc3Q7XG5cdFx0XHRcdFx0d2hpbGUgKHB0MiAmJiBwdDIucHIgPiBwdC5wcikge1xuXHRcdFx0XHRcdFx0cHQyID0gcHQyLl9uZXh0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoKHB0Ll9wcmV2ID0gcHQyID8gcHQyLl9wcmV2IDogbGFzdCkpIHtcblx0XHRcdFx0XHRcdHB0Ll9wcmV2Ll9uZXh0ID0gcHQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGZpcnN0ID0gcHQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICgocHQuX25leHQgPSBwdDIpKSB7XG5cdFx0XHRcdFx0XHRwdDIuX3ByZXYgPSBwdDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGFzdCA9IHB0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwdCA9IG5leHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fZmlyc3RQVCA9IGZpcnN0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblxuXG5cdFx0cC5wYXJzZSA9IGZ1bmN0aW9uKHRhcmdldCwgdmFycywgcHQsIHBsdWdpbikge1xuXHRcdFx0dmFyIHN0eWxlID0gdGFyZ2V0LnN0eWxlLFxuXHRcdFx0XHRwLCBzcCwgYm4sIGVuLCBicywgZXMsIGJzZngsIGVzZngsIGlzU3RyLCByZWw7XG5cdFx0XHRmb3IgKHAgaW4gdmFycykge1xuXHRcdFx0XHRlcyA9IHZhcnNbcF07IC8vZW5kaW5nIHZhbHVlIHN0cmluZ1xuXHRcdFx0XHRzcCA9IF9zcGVjaWFsUHJvcHNbcF07IC8vU3BlY2lhbFByb3AgbG9va3VwLlxuXHRcdFx0XHRpZiAoc3ApIHtcblx0XHRcdFx0XHRwdCA9IHNwLnBhcnNlKHRhcmdldCwgZXMsIHAsIHRoaXMsIHB0LCBwbHVnaW4sIHZhcnMpO1xuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnMgPSBfZ2V0U3R5bGUodGFyZ2V0LCBwLCBfY3MpICsgXCJcIjtcblx0XHRcdFx0XHRpc1N0ciA9ICh0eXBlb2YoZXMpID09PSBcInN0cmluZ1wiKTtcblx0XHRcdFx0XHRpZiAocCA9PT0gXCJjb2xvclwiIHx8IHAgPT09IFwiZmlsbFwiIHx8IHAgPT09IFwic3Ryb2tlXCIgfHwgcC5pbmRleE9mKFwiQ29sb3JcIikgIT09IC0xIHx8IChpc1N0ciAmJiBfcmdiaHNsRXhwLnRlc3QoZXMpKSkgeyAvL09wZXJhIHVzZXMgYmFja2dyb3VuZDogdG8gZGVmaW5lIGNvbG9yIHNvbWV0aW1lcyBpbiBhZGRpdGlvbiB0byBiYWNrZ3JvdW5kQ29sb3I6XG5cdFx0XHRcdFx0XHRpZiAoIWlzU3RyKSB7XG5cdFx0XHRcdFx0XHRcdGVzID0gX3BhcnNlQ29sb3IoZXMpO1xuXHRcdFx0XHRcdFx0XHRlcyA9ICgoZXMubGVuZ3RoID4gMykgPyBcInJnYmEoXCIgOiBcInJnYihcIikgKyBlcy5qb2luKFwiLFwiKSArIFwiKVwiO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cHQgPSBfcGFyc2VDb21wbGV4KHN0eWxlLCBwLCBicywgZXMsIHRydWUsIFwidHJhbnNwYXJlbnRcIiwgcHQsIDAsIHBsdWdpbik7XG5cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzU3RyICYmIChlcy5pbmRleE9mKFwiIFwiKSAhPT0gLTEgfHwgZXMuaW5kZXhPZihcIixcIikgIT09IC0xKSkge1xuXHRcdFx0XHRcdFx0cHQgPSBfcGFyc2VDb21wbGV4KHN0eWxlLCBwLCBicywgZXMsIHRydWUsIG51bGwsIHB0LCAwLCBwbHVnaW4pO1xuXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGJuID0gcGFyc2VGbG9hdChicyk7XG5cdFx0XHRcdFx0XHRic2Z4ID0gKGJuIHx8IGJuID09PSAwKSA/IGJzLnN1YnN0cigoYm4gKyBcIlwiKS5sZW5ndGgpIDogXCJcIjsgLy9yZW1lbWJlciwgYnMgY291bGQgYmUgbm9uLW51bWVyaWMgbGlrZSBcIm5vcm1hbFwiIGZvciBmb250V2VpZ2h0LCBzbyB3ZSBzaG91bGQgZGVmYXVsdCB0byBhIGJsYW5rIHN1ZmZpeCBpbiB0aGF0IGNhc2UuXG5cblx0XHRcdFx0XHRcdGlmIChicyA9PT0gXCJcIiB8fCBicyA9PT0gXCJhdXRvXCIpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHAgPT09IFwid2lkdGhcIiB8fCBwID09PSBcImhlaWdodFwiKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ym4gPSBfZ2V0RGltZW5zaW9uKHRhcmdldCwgcCwgX2NzKTtcblx0XHRcdFx0XHRcdFx0XHRic2Z4ID0gXCJweFwiO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHAgPT09IFwibGVmdFwiIHx8IHAgPT09IFwidG9wXCIpIHtcblx0XHRcdFx0XHRcdFx0XHRibiA9IF9jYWxjdWxhdGVPZmZzZXQodGFyZ2V0LCBwLCBfY3MpO1xuXHRcdFx0XHRcdFx0XHRcdGJzZnggPSBcInB4XCI7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0Ym4gPSAocCAhPT0gXCJvcGFjaXR5XCIpID8gMCA6IDE7XG5cdFx0XHRcdFx0XHRcdFx0YnNmeCA9IFwiXCI7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmVsID0gKGlzU3RyICYmIGVzLmNoYXJBdCgxKSA9PT0gXCI9XCIpO1xuXHRcdFx0XHRcdFx0aWYgKHJlbCkge1xuXHRcdFx0XHRcdFx0XHRlbiA9IHBhcnNlSW50KGVzLmNoYXJBdCgwKSArIFwiMVwiLCAxMCk7XG5cdFx0XHRcdFx0XHRcdGVzID0gZXMuc3Vic3RyKDIpO1xuXHRcdFx0XHRcdFx0XHRlbiAqPSBwYXJzZUZsb2F0KGVzKTtcblx0XHRcdFx0XHRcdFx0ZXNmeCA9IGVzLnJlcGxhY2UoX3N1ZmZpeEV4cCwgXCJcIik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRlbiA9IHBhcnNlRmxvYXQoZXMpO1xuXHRcdFx0XHRcdFx0XHRlc2Z4ID0gaXNTdHIgPyBlcy5yZXBsYWNlKF9zdWZmaXhFeHAsIFwiXCIpIDogXCJcIjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGVzZnggPT09IFwiXCIpIHtcblx0XHRcdFx0XHRcdFx0ZXNmeCA9IChwIGluIF9zdWZmaXhNYXApID8gX3N1ZmZpeE1hcFtwXSA6IGJzZng7IC8vcG9wdWxhdGUgdGhlIGVuZCBzdWZmaXgsIHByaW9yaXRpemluZyB0aGUgbWFwLCB0aGVuIGlmIG5vbmUgaXMgZm91bmQsIHVzZSB0aGUgYmVnaW5uaW5nIHN1ZmZpeC5cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0ZXMgPSAoZW4gfHwgZW4gPT09IDApID8gKHJlbCA/IGVuICsgYm4gOiBlbikgKyBlc2Z4IDogdmFyc1twXTsgLy9lbnN1cmVzIHRoYXQgYW55ICs9IG9yIC09IHByZWZpeGVzIGFyZSB0YWtlbiBjYXJlIG9mLiBSZWNvcmQgdGhlIGVuZCB2YWx1ZSBiZWZvcmUgbm9ybWFsaXppbmcgdGhlIHN1ZmZpeCBiZWNhdXNlIHdlIGFsd2F5cyB3YW50IHRvIGVuZCB0aGUgdHdlZW4gb24gZXhhY3RseSB3aGF0IHRoZXkgaW50ZW5kZWQgZXZlbiBpZiBpdCBkb2Vzbid0IG1hdGNoIHRoZSBiZWdpbm5pbmcgdmFsdWUncyBzdWZmaXguXG5cblx0XHRcdFx0XHRcdC8vaWYgdGhlIGJlZ2lubmluZy9lbmRpbmcgc3VmZml4ZXMgZG9uJ3QgbWF0Y2gsIG5vcm1hbGl6ZSB0aGVtLi4uXG5cdFx0XHRcdFx0XHRpZiAoYnNmeCAhPT0gZXNmeCkgaWYgKGVzZnggIT09IFwiXCIpIGlmIChlbiB8fCBlbiA9PT0gMCkgaWYgKGJuKSB7IC8vbm90ZTogaWYgdGhlIGJlZ2lubmluZyB2YWx1ZSAoYm4pIGlzIDAsIHdlIGRvbid0IG5lZWQgdG8gY29udmVydCB1bml0cyFcblx0XHRcdFx0XHRcdFx0Ym4gPSBfY29udmVydFRvUGl4ZWxzKHRhcmdldCwgcCwgYm4sIGJzZngpO1xuXHRcdFx0XHRcdFx0XHRpZiAoZXNmeCA9PT0gXCIlXCIpIHtcblx0XHRcdFx0XHRcdFx0XHRibiAvPSBfY29udmVydFRvUGl4ZWxzKHRhcmdldCwgcCwgMTAwLCBcIiVcIikgLyAxMDA7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHZhcnMuc3RyaWN0VW5pdHMgIT09IHRydWUpIHsgLy9zb21lIGJyb3dzZXJzIHJlcG9ydCBvbmx5IFwicHhcIiB2YWx1ZXMgaW5zdGVhZCBvZiBhbGxvd2luZyBcIiVcIiB3aXRoIGdldENvbXB1dGVkU3R5bGUoKSwgc28gd2UgYXNzdW1lIHRoYXQgaWYgd2UncmUgdHdlZW5pbmcgdG8gYSAlLCB3ZSBzaG91bGQgc3RhcnQgdGhlcmUgdG9vIHVubGVzcyBzdHJpY3RVbml0czp0cnVlIGlzIGRlZmluZWQuIFRoaXMgYXBwcm9hY2ggaXMgcGFydGljdWxhcmx5IHVzZWZ1bCBmb3IgcmVzcG9uc2l2ZSBkZXNpZ25zIHRoYXQgdXNlIGZyb20oKSB0d2VlbnMuXG5cdFx0XHRcdFx0XHRcdFx0XHRicyA9IGJuICsgXCIlXCI7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZXNmeCA9PT0gXCJlbVwiIHx8IGVzZnggPT09IFwicmVtXCIpIHtcblx0XHRcdFx0XHRcdFx0XHRibiAvPSBfY29udmVydFRvUGl4ZWxzKHRhcmdldCwgcCwgMSwgZXNmeCk7XG5cblx0XHRcdFx0XHRcdFx0Ly9vdGhlcndpc2UgY29udmVydCB0byBwaXhlbHMuXG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZXNmeCAhPT0gXCJweFwiKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZW4gPSBfY29udmVydFRvUGl4ZWxzKHRhcmdldCwgcCwgZW4sIGVzZngpO1xuXHRcdFx0XHRcdFx0XHRcdGVzZnggPSBcInB4XCI7IC8vd2UgZG9uJ3QgdXNlIGJzZnggYWZ0ZXIgdGhpcywgc28gd2UgZG9uJ3QgbmVlZCB0byBzZXQgaXQgdG8gcHggdG9vLlxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChyZWwpIGlmIChlbiB8fCBlbiA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRcdGVzID0gKGVuICsgYm4pICsgZXNmeDsgLy90aGUgY2hhbmdlcyB3ZSBtYWRlIGFmZmVjdCByZWxhdGl2ZSBjYWxjdWxhdGlvbnMsIHNvIGFkanVzdCB0aGUgZW5kIHZhbHVlIGhlcmUuXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKHJlbCkge1xuXHRcdFx0XHRcdFx0XHRlbiArPSBibjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKChibiB8fCBibiA9PT0gMCkgJiYgKGVuIHx8IGVuID09PSAwKSkgeyAvL2Zhc3RlciB0aGFuIGlzTmFOKCkuIEFsc28sIHByZXZpb3VzbHkgd2UgcmVxdWlyZWQgZW4gIT09IGJuIGJ1dCB0aGF0IGRvZXNuJ3QgcmVhbGx5IGdhaW4gbXVjaCBwZXJmb3JtYW5jZSBhbmQgaXQgcHJldmVudHMgX3BhcnNlVG9Qcm94eSgpIGZyb20gd29ya2luZyBwcm9wZXJseSBpZiBiZWdpbm5pbmcgYW5kIGVuZGluZyB2YWx1ZXMgbWF0Y2ggYnV0IG5lZWQgdG8gZ2V0IHR3ZWVuZWQgYnkgYW4gZXh0ZXJuYWwgcGx1Z2luIGFueXdheS4gRm9yIGV4YW1wbGUsIGEgYmV6aWVyIHR3ZWVuIHdoZXJlIHRoZSB0YXJnZXQgc3RhcnRzIGF0IGxlZnQ6MCBhbmQgaGFzIHRoZXNlIHBvaW50czogW3tsZWZ0OjUwfSx7bGVmdDowfV0gd291bGRuJ3Qgd29yayBwcm9wZXJseSBiZWNhdXNlIHdoZW4gcGFyc2luZyB0aGUgbGFzdCBwb2ludCwgaXQnZCBtYXRjaCB0aGUgZmlyc3QgKGN1cnJlbnQpIG9uZSBhbmQgYSBub24tdHdlZW5pbmcgQ1NTUHJvcFR3ZWVuIHdvdWxkIGJlIHJlY29yZGVkIHdoZW4gd2UgYWN0dWFsbHkgbmVlZCBhIG5vcm1hbCB0d2VlbiAodHlwZTowKSBzbyB0aGF0IHRoaW5ncyBnZXQgdXBkYXRlZCBkdXJpbmcgdGhlIHR3ZWVuIHByb3Blcmx5LlxuXHRcdFx0XHRcdFx0XHRwdCA9IG5ldyBDU1NQcm9wVHdlZW4oc3R5bGUsIHAsIGJuLCBlbiAtIGJuLCBwdCwgMCwgcCwgKF9hdXRvUm91bmQgIT09IGZhbHNlICYmIChlc2Z4ID09PSBcInB4XCIgfHwgcCA9PT0gXCJ6SW5kZXhcIikpLCAwLCBicywgZXMpO1xuXHRcdFx0XHRcdFx0XHRwdC54czAgPSBlc2Z4O1xuXHRcdFx0XHRcdFx0XHQvL0RFQlVHOiBfbG9nKFwidHdlZW4gXCIrcCtcIiBmcm9tIFwiK3B0LmIrXCIgKFwiK2JuK2VzZngrXCIpIHRvIFwiK3B0LmUrXCIgd2l0aCBzdWZmaXg6IFwiK3B0LnhzMCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0eWxlW3BdID09PSB1bmRlZmluZWQgfHwgIWVzICYmIChlcyArIFwiXCIgPT09IFwiTmFOXCIgfHwgZXMgPT0gbnVsbCkpIHtcblx0XHRcdFx0XHRcdFx0X2xvZyhcImludmFsaWQgXCIgKyBwICsgXCIgdHdlZW4gdmFsdWU6IFwiICsgdmFyc1twXSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRwdCA9IG5ldyBDU1NQcm9wVHdlZW4oc3R5bGUsIHAsIGVuIHx8IGJuIHx8IDAsIDAsIHB0LCAtMSwgcCwgZmFsc2UsIDAsIGJzLCBlcyk7XG5cdFx0XHRcdFx0XHRcdHB0LnhzMCA9IChlcyA9PT0gXCJub25lXCIgJiYgKHAgPT09IFwiZGlzcGxheVwiIHx8IHAuaW5kZXhPZihcIlN0eWxlXCIpICE9PSAtMSkpID8gYnMgOiBlczsgLy9pbnRlcm1lZGlhdGUgdmFsdWUgc2hvdWxkIHR5cGljYWxseSBiZSBzZXQgaW1tZWRpYXRlbHkgKGVuZCB2YWx1ZSkgZXhjZXB0IGZvciBcImRpc3BsYXlcIiBvciB0aGluZ3MgbGlrZSBib3JkZXJUb3BTdHlsZSwgYm9yZGVyQm90dG9tU3R5bGUsIGV0Yy4gd2hpY2ggc2hvdWxkIHVzZSB0aGUgYmVnaW5uaW5nIHZhbHVlIGR1cmluZyB0aGUgdHdlZW4uXG5cdFx0XHRcdFx0XHRcdC8vREVCVUc6IF9sb2coXCJub24tdHdlZW5pbmcgdmFsdWUgXCIrcCtcIjogXCIrcHQueHMwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBsdWdpbikgaWYgKHB0ICYmICFwdC5wbHVnaW4pIHtcblx0XHRcdFx0XHRwdC5wbHVnaW4gPSBwbHVnaW47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBwdDtcblx0XHR9O1xuXG5cblx0XHQvL2dldHMgY2FsbGVkIGV2ZXJ5IHRpbWUgdGhlIHR3ZWVuIHVwZGF0ZXMsIHBhc3NpbmcgdGhlIG5ldyByYXRpbyAodHlwaWNhbGx5IGEgdmFsdWUgYmV0d2VlbiAwIGFuZCAxLCBidXQgbm90IGFsd2F5cyAoZm9yIGV4YW1wbGUsIGlmIGFuIEVsYXN0aWMuZWFzZU91dCBpcyB1c2VkLCB0aGUgdmFsdWUgY2FuIGp1bXAgYWJvdmUgMSBtaWQtdHdlZW4pLiBJdCB3aWxsIGFsd2F5cyBzdGFydCBhbmQgMCBhbmQgZW5kIGF0IDEuXG5cdFx0cC5zZXRSYXRpbyA9IGZ1bmN0aW9uKHYpIHtcblx0XHRcdHZhciBwdCA9IHRoaXMuX2ZpcnN0UFQsXG5cdFx0XHRcdG1pbiA9IDAuMDAwMDAxLFxuXHRcdFx0XHR2YWwsIHN0ciwgaTtcblx0XHRcdC8vYXQgdGhlIGVuZCBvZiB0aGUgdHdlZW4sIHdlIHNldCB0aGUgdmFsdWVzIHRvIGV4YWN0bHkgd2hhdCB3ZSByZWNlaXZlZCBpbiBvcmRlciB0byBtYWtlIHN1cmUgbm9uLXR3ZWVuaW5nIHZhbHVlcyAobGlrZSBcInBvc2l0aW9uXCIgb3IgXCJmbG9hdFwiIG9yIHdoYXRldmVyKSBhcmUgc2V0IGFuZCBzbyB0aGF0IGlmIHRoZSBiZWdpbm5pbmcvZW5kaW5nIHN1ZmZpeGVzICh1bml0cykgZGlkbid0IG1hdGNoIGFuZCB3ZSBub3JtYWxpemVkIHRvIHB4LCB0aGUgdmFsdWUgdGhhdCB0aGUgdXNlciBwYXNzZWQgaW4gaXMgdXNlZCBoZXJlLiBXZSBjaGVjayB0byBzZWUgaWYgdGhlIHR3ZWVuIGlzIGF0IGl0cyBiZWdpbm5pbmcgaW4gY2FzZSBpdCdzIGEgZnJvbSgpIHR3ZWVuIGluIHdoaWNoIGNhc2UgdGhlIHJhdGlvIHdpbGwgYWN0dWFsbHkgZ28gZnJvbSAxIHRvIDAgb3ZlciB0aGUgY291cnNlIG9mIHRoZSB0d2VlbiAoYmFja3dhcmRzKS5cblx0XHRcdGlmICh2ID09PSAxICYmICh0aGlzLl90d2Vlbi5fdGltZSA9PT0gdGhpcy5fdHdlZW4uX2R1cmF0aW9uIHx8IHRoaXMuX3R3ZWVuLl90aW1lID09PSAwKSkge1xuXHRcdFx0XHR3aGlsZSAocHQpIHtcblx0XHRcdFx0XHRpZiAocHQudHlwZSAhPT0gMikge1xuXHRcdFx0XHRcdFx0aWYgKHB0LnIgJiYgcHQudHlwZSAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0dmFsID0gTWF0aC5yb3VuZChwdC5zICsgcHQuYyk7XG5cdFx0XHRcdFx0XHRcdGlmICghcHQudHlwZSkge1xuXHRcdFx0XHRcdFx0XHRcdHB0LnRbcHQucF0gPSB2YWwgKyBwdC54czA7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocHQudHlwZSA9PT0gMSkgeyAvL2NvbXBsZXggdmFsdWUgKG9uZSB0aGF0IHR5cGljYWxseSBoYXMgbXVsdGlwbGUgbnVtYmVycyBpbnNpZGUgYSBzdHJpbmcsIGxpa2UgXCJyZWN0KDVweCwxMHB4LDIwcHgsMjVweClcIlxuXHRcdFx0XHRcdFx0XHRcdGkgPSBwdC5sO1xuXHRcdFx0XHRcdFx0XHRcdHN0ciA9IHB0LnhzMCArIHZhbCArIHB0LnhzMTtcblx0XHRcdFx0XHRcdFx0XHRmb3IgKGkgPSAxOyBpIDwgcHQubDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzdHIgKz0gcHRbXCJ4blwiK2ldICsgcHRbXCJ4c1wiKyhpKzEpXTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0cHQudFtwdC5wXSA9IHN0cjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cHQudFtwdC5wXSA9IHB0LmU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHB0LnNldFJhdGlvKHYpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwdCA9IHB0Ll9uZXh0O1xuXHRcdFx0XHR9XG5cblx0XHRcdH0gZWxzZSBpZiAodiB8fCAhKHRoaXMuX3R3ZWVuLl90aW1lID09PSB0aGlzLl90d2Vlbi5fZHVyYXRpb24gfHwgdGhpcy5fdHdlZW4uX3RpbWUgPT09IDApIHx8IHRoaXMuX3R3ZWVuLl9yYXdQcmV2VGltZSA9PT0gLTAuMDAwMDAxKSB7XG5cdFx0XHRcdHdoaWxlIChwdCkge1xuXHRcdFx0XHRcdHZhbCA9IHB0LmMgKiB2ICsgcHQucztcblx0XHRcdFx0XHRpZiAocHQucikge1xuXHRcdFx0XHRcdFx0dmFsID0gTWF0aC5yb3VuZCh2YWwpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodmFsIDwgbWluKSBpZiAodmFsID4gLW1pbikge1xuXHRcdFx0XHRcdFx0dmFsID0gMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFwdC50eXBlKSB7XG5cdFx0XHRcdFx0XHRwdC50W3B0LnBdID0gdmFsICsgcHQueHMwO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocHQudHlwZSA9PT0gMSkgeyAvL2NvbXBsZXggdmFsdWUgKG9uZSB0aGF0IHR5cGljYWxseSBoYXMgbXVsdGlwbGUgbnVtYmVycyBpbnNpZGUgYSBzdHJpbmcsIGxpa2UgXCJyZWN0KDVweCwxMHB4LDIwcHgsMjVweClcIlxuXHRcdFx0XHRcdFx0aSA9IHB0Lmw7XG5cdFx0XHRcdFx0XHRpZiAoaSA9PT0gMikge1xuXHRcdFx0XHRcdFx0XHRwdC50W3B0LnBdID0gcHQueHMwICsgdmFsICsgcHQueHMxICsgcHQueG4xICsgcHQueHMyO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChpID09PSAzKSB7XG5cdFx0XHRcdFx0XHRcdHB0LnRbcHQucF0gPSBwdC54czAgKyB2YWwgKyBwdC54czEgKyBwdC54bjEgKyBwdC54czIgKyBwdC54bjIgKyBwdC54czM7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGkgPT09IDQpIHtcblx0XHRcdFx0XHRcdFx0cHQudFtwdC5wXSA9IHB0LnhzMCArIHZhbCArIHB0LnhzMSArIHB0LnhuMSArIHB0LnhzMiArIHB0LnhuMiArIHB0LnhzMyArIHB0LnhuMyArIHB0LnhzNDtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaSA9PT0gNSkge1xuXHRcdFx0XHRcdFx0XHRwdC50W3B0LnBdID0gcHQueHMwICsgdmFsICsgcHQueHMxICsgcHQueG4xICsgcHQueHMyICsgcHQueG4yICsgcHQueHMzICsgcHQueG4zICsgcHQueHM0ICsgcHQueG40ICsgcHQueHM1O1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c3RyID0gcHQueHMwICsgdmFsICsgcHQueHMxO1xuXHRcdFx0XHRcdFx0XHRmb3IgKGkgPSAxOyBpIDwgcHQubDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0c3RyICs9IHB0W1wieG5cIitpXSArIHB0W1wieHNcIisoaSsxKV07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cHQudFtwdC5wXSA9IHN0cjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdH0gZWxzZSBpZiAocHQudHlwZSA9PT0gLTEpIHsgLy9ub24tdHdlZW5pbmcgdmFsdWVcblx0XHRcdFx0XHRcdHB0LnRbcHQucF0gPSBwdC54czA7XG5cblx0XHRcdFx0XHR9IGVsc2UgaWYgKHB0LnNldFJhdGlvKSB7IC8vY3VzdG9tIHNldFJhdGlvKCkgZm9yIHRoaW5ncyBsaWtlIFNwZWNpYWxQcm9wcywgZXh0ZXJuYWwgcGx1Z2lucywgZXRjLlxuXHRcdFx0XHRcdFx0cHQuc2V0UmF0aW8odik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHB0ID0gcHQuX25leHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0Ly9pZiB0aGUgdHdlZW4gaXMgcmV2ZXJzZWQgYWxsIHRoZSB3YXkgYmFjayB0byB0aGUgYmVnaW5uaW5nLCB3ZSBuZWVkIHRvIHJlc3RvcmUgdGhlIG9yaWdpbmFsIHZhbHVlcyB3aGljaCBtYXkgaGF2ZSBkaWZmZXJlbnQgdW5pdHMgKGxpa2UgJSBpbnN0ZWFkIG9mIHB4IG9yIGVtIG9yIHdoYXRldmVyKS5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdoaWxlIChwdCkge1xuXHRcdFx0XHRcdGlmIChwdC50eXBlICE9PSAyKSB7XG5cdFx0XHRcdFx0XHRwdC50W3B0LnBdID0gcHQuYjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cHQuc2V0UmF0aW8odik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHB0ID0gcHQuX25leHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0LyoqXG5cdFx0ICogQHByaXZhdGVcblx0XHQgKiBGb3JjZXMgcmVuZGVyaW5nIG9mIHRoZSB0YXJnZXQncyB0cmFuc2Zvcm1zIChyb3RhdGlvbiwgc2NhbGUsIGV0Yy4pIHdoZW5ldmVyIHRoZSBDU1NQbHVnaW4ncyBzZXRSYXRpbygpIGlzIGNhbGxlZC5cblx0XHQgKiBCYXNpY2FsbHksIHRoaXMgdGVsbHMgdGhlIENTU1BsdWdpbiB0byBjcmVhdGUgYSBDU1NQcm9wVHdlZW4gKHR5cGUgMikgYWZ0ZXIgaW5zdGFudGlhdGlvbiB0aGF0IHJ1bnMgbGFzdCBpbiB0aGUgbGlua2VkXG5cdFx0ICogbGlzdCBhbmQgY2FsbHMgdGhlIGFwcHJvcHJpYXRlICgzRCBvciAyRCkgcmVuZGVyaW5nIGZ1bmN0aW9uLiBXZSBzZXBhcmF0ZSB0aGlzIGludG8gaXRzIG93biBtZXRob2Qgc28gdGhhdCB3ZSBjYW4gY2FsbFxuXHRcdCAqIGl0IGZyb20gb3RoZXIgcGx1Z2lucyBsaWtlIEJlemllclBsdWdpbiBpZiwgZm9yIGV4YW1wbGUsIGl0IG5lZWRzIHRvIGFwcGx5IGFuIGF1dG9Sb3RhdGlvbiBhbmQgdGhpcyBDU1NQbHVnaW5cblx0XHQgKiBkb2Vzbid0IGhhdmUgYW55IHRyYW5zZm9ybS1yZWxhdGVkIHByb3BlcnRpZXMgb2YgaXRzIG93bi4gWW91IGNhbiBjYWxsIHRoaXMgbWV0aG9kIGFzIG1hbnkgdGltZXMgYXMgeW91XG5cdFx0ICogd2FudCBhbmQgaXQgd29uJ3QgY3JlYXRlIGR1cGxpY2F0ZSBDU1NQcm9wVHdlZW5zLlxuXHRcdCAqXG5cdFx0ICogQHBhcmFtIHtib29sZWFufSB0aHJlZUQgaWYgdHJ1ZSwgaXQgc2hvdWxkIGFwcGx5IDNEIHR3ZWVucyAob3RoZXJ3aXNlLCBqdXN0IDJEIG9uZXMgYXJlIGZpbmUgYW5kIHR5cGljYWxseSBmYXN0ZXIpXG5cdFx0ICovXG5cdFx0cC5fZW5hYmxlVHJhbnNmb3JtcyA9IGZ1bmN0aW9uKHRocmVlRCkge1xuXHRcdFx0dGhpcy5fdHJhbnNmb3JtID0gdGhpcy5fdHJhbnNmb3JtIHx8IF9nZXRUcmFuc2Zvcm0odGhpcy5fdGFyZ2V0LCBfY3MsIHRydWUpOyAvL2Vuc3VyZXMgdGhhdCB0aGUgZWxlbWVudCBoYXMgYSBfZ3NUcmFuc2Zvcm0gcHJvcGVydHkgd2l0aCB0aGUgYXBwcm9wcmlhdGUgdmFsdWVzLlxuXHRcdFx0dGhpcy5fdHJhbnNmb3JtVHlwZSA9ICghKHRoaXMuX3RyYW5zZm9ybS5zdmcgJiYgX3VzZVNWR1RyYW5zZm9ybUF0dHIpICYmICh0aHJlZUQgfHwgdGhpcy5fdHJhbnNmb3JtVHlwZSA9PT0gMykpID8gMyA6IDI7XG5cdFx0fTtcblxuXHRcdHZhciBsYXp5U2V0ID0gZnVuY3Rpb24odikge1xuXHRcdFx0dGhpcy50W3RoaXMucF0gPSB0aGlzLmU7XG5cdFx0XHR0aGlzLmRhdGEuX2xpbmtDU1NQKHRoaXMsIHRoaXMuX25leHQsIG51bGwsIHRydWUpOyAvL3dlIHB1cnBvc2VmdWxseSBrZWVwIHRoaXMuX25leHQgZXZlbiB0aG91Z2ggaXQnZCBtYWtlIHNlbnNlIHRvIG51bGwgaXQsIGJ1dCB0aGlzIGlzIGEgcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uLCBhcyB0aGlzIGhhcHBlbnMgZHVyaW5nIHRoZSB3aGlsZSAocHQpIHt9IGxvb3AgaW4gc2V0UmF0aW8oKSBhdCB0aGUgYm90dG9tIG9mIHdoaWNoIGl0IHNldHMgcHQgPSBwdC5fbmV4dCwgc28gaWYgd2UgbnVsbCBpdCwgdGhlIGxpbmtlZCBsaXN0IHdpbGwgYmUgYnJva2VuIGluIHRoYXQgbG9vcC5cblx0XHR9O1xuXHRcdC8qKiBAcHJpdmF0ZSBHaXZlcyB1cyBhIHdheSB0byBzZXQgYSB2YWx1ZSBvbiB0aGUgZmlyc3QgcmVuZGVyIChhbmQgb25seSB0aGUgZmlyc3QgcmVuZGVyKS4gKiovXG5cdFx0cC5fYWRkTGF6eVNldCA9IGZ1bmN0aW9uKHQsIHAsIHYpIHtcblx0XHRcdHZhciBwdCA9IHRoaXMuX2ZpcnN0UFQgPSBuZXcgQ1NTUHJvcFR3ZWVuKHQsIHAsIDAsIDAsIHRoaXMuX2ZpcnN0UFQsIDIpO1xuXHRcdFx0cHQuZSA9IHY7XG5cdFx0XHRwdC5zZXRSYXRpbyA9IGxhenlTZXQ7XG5cdFx0XHRwdC5kYXRhID0gdGhpcztcblx0XHR9O1xuXG5cdFx0LyoqIEBwcml2YXRlICoqL1xuXHRcdHAuX2xpbmtDU1NQID0gZnVuY3Rpb24ocHQsIG5leHQsIHByZXYsIHJlbW92ZSkge1xuXHRcdFx0aWYgKHB0KSB7XG5cdFx0XHRcdGlmIChuZXh0KSB7XG5cdFx0XHRcdFx0bmV4dC5fcHJldiA9IHB0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwdC5fbmV4dCkge1xuXHRcdFx0XHRcdHB0Ll9uZXh0Ll9wcmV2ID0gcHQuX3ByZXY7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHB0Ll9wcmV2KSB7XG5cdFx0XHRcdFx0cHQuX3ByZXYuX25leHQgPSBwdC5fbmV4dDtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9maXJzdFBUID09PSBwdCkge1xuXHRcdFx0XHRcdHRoaXMuX2ZpcnN0UFQgPSBwdC5fbmV4dDtcblx0XHRcdFx0XHRyZW1vdmUgPSB0cnVlOyAvL2p1c3QgdG8gcHJldmVudCByZXNldHRpbmcgdGhpcy5fZmlyc3RQVCA1IGxpbmVzIGRvd24gaW4gY2FzZSBwdC5fbmV4dCBpcyBudWxsLiAob3B0aW1pemVkIGZvciBzcGVlZClcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJldikge1xuXHRcdFx0XHRcdHByZXYuX25leHQgPSBwdDtcblx0XHRcdFx0fSBlbHNlIGlmICghcmVtb3ZlICYmIHRoaXMuX2ZpcnN0UFQgPT09IG51bGwpIHtcblx0XHRcdFx0XHR0aGlzLl9maXJzdFBUID0gcHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHQuX25leHQgPSBuZXh0O1xuXHRcdFx0XHRwdC5fcHJldiA9IHByZXY7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHQ7XG5cdFx0fTtcblxuXHRcdC8vd2UgbmVlZCB0byBtYWtlIHN1cmUgdGhhdCBpZiBhbHBoYSBvciBhdXRvQWxwaGEgaXMga2lsbGVkLCBvcGFjaXR5IGlzIHRvby4gQW5kIGF1dG9BbHBoYSBhZmZlY3RzIHRoZSBcInZpc2liaWxpdHlcIiBwcm9wZXJ0eS5cblx0XHRwLl9raWxsID0gZnVuY3Rpb24obG9va3VwKSB7XG5cdFx0XHR2YXIgY29weSA9IGxvb2t1cCxcblx0XHRcdFx0cHQsIHAsIHhmaXJzdDtcblx0XHRcdGlmIChsb29rdXAuYXV0b0FscGhhIHx8IGxvb2t1cC5hbHBoYSkge1xuXHRcdFx0XHRjb3B5ID0ge307XG5cdFx0XHRcdGZvciAocCBpbiBsb29rdXApIHsgLy9jb3B5IHRoZSBsb29rdXAgc28gdGhhdCB3ZSdyZSBub3QgY2hhbmdpbmcgdGhlIG9yaWdpbmFsIHdoaWNoIG1heSBiZSBwYXNzZWQgZWxzZXdoZXJlLlxuXHRcdFx0XHRcdGNvcHlbcF0gPSBsb29rdXBbcF07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29weS5vcGFjaXR5ID0gMTtcblx0XHRcdFx0aWYgKGNvcHkuYXV0b0FscGhhKSB7XG5cdFx0XHRcdFx0Y29weS52aXNpYmlsaXR5ID0gMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGxvb2t1cC5jbGFzc05hbWUgJiYgKHB0ID0gdGhpcy5fY2xhc3NOYW1lUFQpKSB7IC8vZm9yIGNsYXNzTmFtZSB0d2VlbnMsIHdlIG5lZWQgdG8ga2lsbCBhbnkgYXNzb2NpYXRlZCBDU1NQcm9wVHdlZW5zIHRvbzsgYSBsaW5rZWQgbGlzdCBzdGFydHMgYXQgdGhlIGNsYXNzTmFtZSdzIFwieGZpcnN0XCIuXG5cdFx0XHRcdHhmaXJzdCA9IHB0LnhmaXJzdDtcblx0XHRcdFx0aWYgKHhmaXJzdCAmJiB4Zmlyc3QuX3ByZXYpIHtcblx0XHRcdFx0XHR0aGlzLl9saW5rQ1NTUCh4Zmlyc3QuX3ByZXYsIHB0Ll9uZXh0LCB4Zmlyc3QuX3ByZXYuX3ByZXYpOyAvL2JyZWFrIG9mZiB0aGUgcHJldlxuXHRcdFx0XHR9IGVsc2UgaWYgKHhmaXJzdCA9PT0gdGhpcy5fZmlyc3RQVCkge1xuXHRcdFx0XHRcdHRoaXMuX2ZpcnN0UFQgPSBwdC5fbmV4dDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHQuX25leHQpIHtcblx0XHRcdFx0XHR0aGlzLl9saW5rQ1NTUChwdC5fbmV4dCwgcHQuX25leHQuX25leHQsIHhmaXJzdC5fcHJldik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY2xhc3NOYW1lUFQgPSBudWxsO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFR3ZWVuUGx1Z2luLnByb3RvdHlwZS5fa2lsbC5jYWxsKHRoaXMsIGNvcHkpO1xuXHRcdH07XG5cblxuXG5cdFx0Ly91c2VkIGJ5IGNhc2NhZGVUbygpIGZvciBnYXRoZXJpbmcgYWxsIHRoZSBzdHlsZSBwcm9wZXJ0aWVzIG9mIGVhY2ggY2hpbGQgZWxlbWVudCBpbnRvIGFuIGFycmF5IGZvciBjb21wYXJpc29uLlxuXHRcdHZhciBfZ2V0Q2hpbGRTdHlsZXMgPSBmdW5jdGlvbihlLCBwcm9wcywgdGFyZ2V0cykge1xuXHRcdFx0XHR2YXIgY2hpbGRyZW4sIGksIGNoaWxkLCB0eXBlO1xuXHRcdFx0XHRpZiAoZS5zbGljZSkge1xuXHRcdFx0XHRcdGkgPSBlLmxlbmd0aDtcblx0XHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHRcdF9nZXRDaGlsZFN0eWxlcyhlW2ldLCBwcm9wcywgdGFyZ2V0cyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjaGlsZHJlbiA9IGUuY2hpbGROb2Rlcztcblx0XHRcdFx0aSA9IGNoaWxkcmVuLmxlbmd0aDtcblx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0Y2hpbGQgPSBjaGlsZHJlbltpXTtcblx0XHRcdFx0XHR0eXBlID0gY2hpbGQudHlwZTtcblx0XHRcdFx0XHRpZiAoY2hpbGQuc3R5bGUpIHtcblx0XHRcdFx0XHRcdHByb3BzLnB1c2goX2dldEFsbFN0eWxlcyhjaGlsZCkpO1xuXHRcdFx0XHRcdFx0aWYgKHRhcmdldHMpIHtcblx0XHRcdFx0XHRcdFx0dGFyZ2V0cy5wdXNoKGNoaWxkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCh0eXBlID09PSAxIHx8IHR5cGUgPT09IDkgfHwgdHlwZSA9PT0gMTEpICYmIGNoaWxkLmNoaWxkTm9kZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRfZ2V0Q2hpbGRTdHlsZXMoY2hpbGQsIHByb3BzLCB0YXJnZXRzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHQvKipcblx0XHQgKiBUeXBpY2FsbHkgb25seSB1c2VmdWwgZm9yIGNsYXNzTmFtZSB0d2VlbnMgdGhhdCBtYXkgYWZmZWN0IGNoaWxkIGVsZW1lbnRzLCB0aGlzIG1ldGhvZCBjcmVhdGVzIGEgVHdlZW5MaXRlXG5cdFx0ICogYW5kIHRoZW4gY29tcGFyZXMgdGhlIHN0eWxlIHByb3BlcnRpZXMgb2YgYWxsIHRoZSB0YXJnZXQncyBjaGlsZCBlbGVtZW50cyBhdCB0aGUgdHdlZW4ncyBzdGFydCBhbmQgZW5kLCBhbmRcblx0XHQgKiBpZiBhbnkgYXJlIGRpZmZlcmVudCwgaXQgYWxzbyBjcmVhdGVzIHR3ZWVucyBmb3IgdGhvc2UgYW5kIHJldHVybnMgYW4gYXJyYXkgY29udGFpbmluZyBBTEwgb2YgdGhlIHJlc3VsdGluZ1xuXHRcdCAqIHR3ZWVucyAoc28gdGhhdCB5b3UgY2FuIGVhc2lseSBhZGQoKSB0aGVtIHRvIGEgVGltZWxpbmVMaXRlLCBmb3IgZXhhbXBsZSkuIFRoZSByZWFzb24gdGhpcyBmdW5jdGlvbmFsaXR5IGlzXG5cdFx0ICogd3JhcHBlZCBpbnRvIGEgc2VwYXJhdGUgc3RhdGljIG1ldGhvZCBvZiBDU1NQbHVnaW4gaW5zdGVhZCBvZiBiZWluZyBpbnRlZ3JhdGVkIGludG8gYWxsIHJlZ3VsYXIgY2xhc3NOYW1lIHR3ZWVuc1xuXHRcdCAqIGlzIGJlY2F1c2UgaXQgY3JlYXRlcyBlbnRpcmVseSBuZXcgdHdlZW5zIHRoYXQgbWF5IGhhdmUgY29tcGxldGVseSBkaWZmZXJlbnQgdGFyZ2V0cyB0aGFuIHRoZSBvcmlnaW5hbCB0d2Vlbixcblx0XHQgKiBzbyBpZiB0aGV5IHdlcmUgYWxsIGx1bXBlZCBpbnRvIHRoZSBvcmlnaW5hbCB0d2VlbiBpbnN0YW5jZSwgaXQgd291bGQgYmUgaW5jb25zaXN0ZW50IHdpdGggdGhlIHJlc3Qgb2YgdGhlIEFQSVxuXHRcdCAqIGFuZCBpdCB3b3VsZCBjcmVhdGUgb3RoZXIgcHJvYmxlbXMuIEZvciBleGFtcGxlOlxuXHRcdCAqICAtIElmIEkgY3JlYXRlIGEgdHdlZW4gb2YgZWxlbWVudEEsIHRoYXQgdHdlZW4gaW5zdGFuY2UgbWF5IHN1ZGRlbmx5IGNoYW5nZSBpdHMgdGFyZ2V0IHRvIGluY2x1ZGUgNTAgb3RoZXIgZWxlbWVudHMgKHVuaW50dWl0aXZlIGlmIEkgc3BlY2lmaWNhbGx5IGRlZmluZWQgdGhlIHRhcmdldCBJIHdhbnRlZClcblx0XHQgKiAgLSBXZSBjYW4ndCBqdXN0IGNyZWF0ZSBuZXcgaW5kZXBlbmRlbnQgdHdlZW5zIGJlY2F1c2Ugb3RoZXJ3aXNlLCB3aGF0IGhhcHBlbnMgaWYgdGhlIG9yaWdpbmFsL3BhcmVudCB0d2VlbiBpcyByZXZlcnNlZCBvciBwYXVzZSBvciBkcm9wcGVkIGludG8gYSBUaW1lbGluZUxpdGUgZm9yIHRpZ2h0IGNvbnRyb2w/IFlvdSdkIGV4cGVjdCB0aGF0IHR3ZWVuJ3MgYmVoYXZpb3IgdG8gYWZmZWN0IGFsbCB0aGUgb3RoZXJzLlxuXHRcdCAqICAtIEFuYWx5emluZyBldmVyeSBzdHlsZSBwcm9wZXJ0eSBvZiBldmVyeSBjaGlsZCBiZWZvcmUgYW5kIGFmdGVyIHRoZSB0d2VlbiBpcyBhbiBleHBlbnNpdmUgb3BlcmF0aW9uIHdoZW4gdGhlcmUgYXJlIG1hbnkgY2hpbGRyZW4sIHNvIHRoaXMgYmVoYXZpb3Igc2hvdWxkbid0IGJlIGltcG9zZWQgb24gYWxsIGNsYXNzTmFtZSB0d2VlbnMgYnkgZGVmYXVsdCwgZXNwZWNpYWxseSBzaW5jZSBpdCdzIHByb2JhYmx5IHJhcmUgdGhhdCB0aGlzIGV4dHJhIGZ1bmN0aW9uYWxpdHkgaXMgbmVlZGVkLlxuXHRcdCAqXG5cdFx0ICogQHBhcmFtIHtPYmplY3R9IHRhcmdldCBvYmplY3QgdG8gYmUgdHdlZW5lZFxuXHRcdCAqIEBwYXJhbSB7bnVtYmVyfSBEdXJhdGlvbiBpbiBzZWNvbmRzIChvciBmcmFtZXMgZm9yIGZyYW1lcy1iYXNlZCB0d2VlbnMpXG5cdFx0ICogQHBhcmFtIHtPYmplY3R9IE9iamVjdCBjb250YWluaW5nIHRoZSBlbmQgdmFsdWVzLCBsaWtlIHtjbGFzc05hbWU6XCJuZXdDbGFzc1wiLCBlYXNlOkxpbmVhci5lYXNlTm9uZX1cblx0XHQgKiBAcmV0dXJuIHtBcnJheX0gQW4gYXJyYXkgb2YgVHdlZW5MaXRlIGluc3RhbmNlc1xuXHRcdCAqL1xuXHRcdENTU1BsdWdpbi5jYXNjYWRlVG8gPSBmdW5jdGlvbih0YXJnZXQsIGR1cmF0aW9uLCB2YXJzKSB7XG5cdFx0XHR2YXIgdHdlZW4gPSBUd2VlbkxpdGUudG8odGFyZ2V0LCBkdXJhdGlvbiwgdmFycyksXG5cdFx0XHRcdHJlc3VsdHMgPSBbdHdlZW5dLFxuXHRcdFx0XHRiID0gW10sXG5cdFx0XHRcdGUgPSBbXSxcblx0XHRcdFx0dGFyZ2V0cyA9IFtdLFxuXHRcdFx0XHRfcmVzZXJ2ZWRQcm9wcyA9IFR3ZWVuTGl0ZS5faW50ZXJuYWxzLnJlc2VydmVkUHJvcHMsXG5cdFx0XHRcdGksIGRpZnMsIHAsIGZyb207XG5cdFx0XHR0YXJnZXQgPSB0d2Vlbi5fdGFyZ2V0cyB8fCB0d2Vlbi50YXJnZXQ7XG5cdFx0XHRfZ2V0Q2hpbGRTdHlsZXModGFyZ2V0LCBiLCB0YXJnZXRzKTtcblx0XHRcdHR3ZWVuLnJlbmRlcihkdXJhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHRfZ2V0Q2hpbGRTdHlsZXModGFyZ2V0LCBlKTtcblx0XHRcdHR3ZWVuLnJlbmRlcigwLCB0cnVlLCB0cnVlKTtcblx0XHRcdHR3ZWVuLl9lbmFibGVkKHRydWUpO1xuXHRcdFx0aSA9IHRhcmdldHMubGVuZ3RoO1xuXHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdGRpZnMgPSBfY3NzRGlmKHRhcmdldHNbaV0sIGJbaV0sIGVbaV0pO1xuXHRcdFx0XHRpZiAoZGlmcy5maXJzdE1QVCkge1xuXHRcdFx0XHRcdGRpZnMgPSBkaWZzLmRpZnM7XG5cdFx0XHRcdFx0Zm9yIChwIGluIHZhcnMpIHtcblx0XHRcdFx0XHRcdGlmIChfcmVzZXJ2ZWRQcm9wc1twXSkge1xuXHRcdFx0XHRcdFx0XHRkaWZzW3BdID0gdmFyc1twXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZnJvbSA9IHt9O1xuXHRcdFx0XHRcdGZvciAocCBpbiBkaWZzKSB7XG5cdFx0XHRcdFx0XHRmcm9tW3BdID0gYltpXVtwXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKFR3ZWVuTGl0ZS5mcm9tVG8odGFyZ2V0c1tpXSwgZHVyYXRpb24sIGZyb20sIGRpZnMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdHM7XG5cdFx0fTtcblxuXHRcdFR3ZWVuUGx1Z2luLmFjdGl2YXRlKFtDU1NQbHVnaW5dKTtcblx0XHRyZXR1cm4gQ1NTUGx1Z2luO1xuXG5cdH0sIHRydWUpO1xuXG59KTsgaWYgKF9nc1Njb3BlLl9nc0RlZmluZSkgeyBfZ3NTY29wZS5fZ3NRdWV1ZS5wb3AoKSgpOyB9XG5cbi8vZXhwb3J0IHRvIEFNRC9SZXF1aXJlSlMgYW5kIENvbW1vbkpTL05vZGUgKHByZWN1cnNvciB0byBmdWxsIG1vZHVsYXIgYnVpbGQgc3lzdGVtIGNvbWluZyBhdCBhIGxhdGVyIGRhdGUpXG4oZnVuY3Rpb24obmFtZSkge1xuXHRcInVzZSBzdHJpY3RcIjtcblx0dmFyIGdldEdsb2JhbCA9IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiAoX2dzU2NvcGUuR3JlZW5Tb2NrR2xvYmFscyB8fCBfZ3NTY29wZSlbbmFtZV07XG5cdH07XG5cdGlmICh0eXBlb2YoZGVmaW5lKSA9PT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQpIHsgLy9BTURcblx0XHRkZWZpbmUoW1wiVHdlZW5MaXRlXCJdLCBnZXRHbG9iYWwpO1xuXHR9IGVsc2UgaWYgKHR5cGVvZihtb2R1bGUpICE9PSBcInVuZGVmaW5lZFwiICYmIG1vZHVsZS5leHBvcnRzKSB7IC8vbm9kZVxuXHRcdG1vZHVsZS5leHBvcnRzID0gZ2V0R2xvYmFsKCk7XG5cdH1cbn0oXCJDU1NQbHVnaW5cIikpO1xuIiwiLyohXG4gKiBWRVJTSU9OOiBiZXRhIDEuMTUuMlxuICogREFURTogMjAxNS0wMS0yN1xuICogVVBEQVRFUyBBTkQgRE9DUyBBVDogaHR0cDovL2dyZWVuc29jay5jb21cbiAqXG4gKiBAbGljZW5zZSBDb3B5cmlnaHQgKGMpIDIwMDgtMjAxNSwgR3JlZW5Tb2NrLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyB3b3JrIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIGF0IGh0dHA6Ly9ncmVlbnNvY2suY29tL3N0YW5kYXJkLWxpY2Vuc2Ugb3IgZm9yXG4gKiBDbHViIEdyZWVuU29jayBtZW1iZXJzLCB0aGUgc29mdHdhcmUgYWdyZWVtZW50IHRoYXQgd2FzIGlzc3VlZCB3aXRoIHlvdXIgbWVtYmVyc2hpcC5cbiAqIFxuICogQGF1dGhvcjogSmFjayBEb3lsZSwgamFja0BncmVlbnNvY2suY29tXG4gKiovXG52YXIgX2dzU2NvcGUgPSAodHlwZW9mKG1vZHVsZSkgIT09IFwidW5kZWZpbmVkXCIgJiYgbW9kdWxlLmV4cG9ydHMgJiYgdHlwZW9mKGdsb2JhbCkgIT09IFwidW5kZWZpbmVkXCIpID8gZ2xvYmFsIDogdGhpcyB8fCB3aW5kb3c7IC8vaGVscHMgZW5zdXJlIGNvbXBhdGliaWxpdHkgd2l0aCBBTUQvUmVxdWlyZUpTIGFuZCBDb21tb25KUy9Ob2RlXG4oX2dzU2NvcGUuX2dzUXVldWUgfHwgKF9nc1Njb3BlLl9nc1F1ZXVlID0gW10pKS5wdXNoKCBmdW5jdGlvbigpIHtcblxuXHRcInVzZSBzdHJpY3RcIjtcblxuXHRfZ3NTY29wZS5fZ3NEZWZpbmUoXCJlYXNpbmcuQmFja1wiLCBbXCJlYXNpbmcuRWFzZVwiXSwgZnVuY3Rpb24oRWFzZSkge1xuXHRcdFxuXHRcdHZhciB3ID0gKF9nc1Njb3BlLkdyZWVuU29ja0dsb2JhbHMgfHwgX2dzU2NvcGUpLFxuXHRcdFx0Z3MgPSB3LmNvbS5ncmVlbnNvY2ssXG5cdFx0XHRfMlBJID0gTWF0aC5QSSAqIDIsXG5cdFx0XHRfSEFMRl9QSSA9IE1hdGguUEkgLyAyLFxuXHRcdFx0X2NsYXNzID0gZ3MuX2NsYXNzLFxuXHRcdFx0X2NyZWF0ZSA9IGZ1bmN0aW9uKG4sIGYpIHtcblx0XHRcdFx0dmFyIEMgPSBfY2xhc3MoXCJlYXNpbmcuXCIgKyBuLCBmdW5jdGlvbigpe30sIHRydWUpLFxuXHRcdFx0XHRcdHAgPSBDLnByb3RvdHlwZSA9IG5ldyBFYXNlKCk7XG5cdFx0XHRcdHAuY29uc3RydWN0b3IgPSBDO1xuXHRcdFx0XHRwLmdldFJhdGlvID0gZjtcblx0XHRcdFx0cmV0dXJuIEM7XG5cdFx0XHR9LFxuXHRcdFx0X2Vhc2VSZWcgPSBFYXNlLnJlZ2lzdGVyIHx8IGZ1bmN0aW9uKCl7fSwgLy9wdXQgYW4gZW1wdHkgZnVuY3Rpb24gaW4gcGxhY2UganVzdCBhcyBhIHNhZmV0eSBtZWFzdXJlIGluIGNhc2Ugc29tZW9uZSBsb2FkcyBhbiBPTEQgdmVyc2lvbiBvZiBUd2VlbkxpdGUuanMgd2hlcmUgRWFzZS5yZWdpc3RlciBkb2Vzbid0IGV4aXN0LlxuXHRcdFx0X3dyYXAgPSBmdW5jdGlvbihuYW1lLCBFYXNlT3V0LCBFYXNlSW4sIEVhc2VJbk91dCwgYWxpYXNlcykge1xuXHRcdFx0XHR2YXIgQyA9IF9jbGFzcyhcImVhc2luZy5cIituYW1lLCB7XG5cdFx0XHRcdFx0ZWFzZU91dDpuZXcgRWFzZU91dCgpLFxuXHRcdFx0XHRcdGVhc2VJbjpuZXcgRWFzZUluKCksXG5cdFx0XHRcdFx0ZWFzZUluT3V0Om5ldyBFYXNlSW5PdXQoKVxuXHRcdFx0XHR9LCB0cnVlKTtcblx0XHRcdFx0X2Vhc2VSZWcoQywgbmFtZSk7XG5cdFx0XHRcdHJldHVybiBDO1xuXHRcdFx0fSxcblx0XHRcdEVhc2VQb2ludCA9IGZ1bmN0aW9uKHRpbWUsIHZhbHVlLCBuZXh0KSB7XG5cdFx0XHRcdHRoaXMudCA9IHRpbWU7XG5cdFx0XHRcdHRoaXMudiA9IHZhbHVlO1xuXHRcdFx0XHRpZiAobmV4dCkge1xuXHRcdFx0XHRcdHRoaXMubmV4dCA9IG5leHQ7XG5cdFx0XHRcdFx0bmV4dC5wcmV2ID0gdGhpcztcblx0XHRcdFx0XHR0aGlzLmMgPSBuZXh0LnYgLSB2YWx1ZTtcblx0XHRcdFx0XHR0aGlzLmdhcCA9IG5leHQudCAtIHRpbWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdC8vQmFja1xuXHRcdFx0X2NyZWF0ZUJhY2sgPSBmdW5jdGlvbihuLCBmKSB7XG5cdFx0XHRcdHZhciBDID0gX2NsYXNzKFwiZWFzaW5nLlwiICsgbiwgZnVuY3Rpb24ob3ZlcnNob290KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wMSA9IChvdmVyc2hvb3QgfHwgb3ZlcnNob290ID09PSAwKSA/IG92ZXJzaG9vdCA6IDEuNzAxNTg7XG5cdFx0XHRcdFx0XHR0aGlzLl9wMiA9IHRoaXMuX3AxICogMS41MjU7XG5cdFx0XHRcdFx0fSwgdHJ1ZSksIFxuXHRcdFx0XHRcdHAgPSBDLnByb3RvdHlwZSA9IG5ldyBFYXNlKCk7XG5cdFx0XHRcdHAuY29uc3RydWN0b3IgPSBDO1xuXHRcdFx0XHRwLmdldFJhdGlvID0gZjtcblx0XHRcdFx0cC5jb25maWcgPSBmdW5jdGlvbihvdmVyc2hvb3QpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEMob3ZlcnNob290KTtcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuIEM7XG5cdFx0XHR9LFxuXG5cdFx0XHRCYWNrID0gX3dyYXAoXCJCYWNrXCIsXG5cdFx0XHRcdF9jcmVhdGVCYWNrKFwiQmFja091dFwiLCBmdW5jdGlvbihwKSB7XG5cdFx0XHRcdFx0cmV0dXJuICgocCA9IHAgLSAxKSAqIHAgKiAoKHRoaXMuX3AxICsgMSkgKiBwICsgdGhpcy5fcDEpICsgMSk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRfY3JlYXRlQmFjayhcIkJhY2tJblwiLCBmdW5jdGlvbihwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHAgKiBwICogKCh0aGlzLl9wMSArIDEpICogcCAtIHRoaXMuX3AxKTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdF9jcmVhdGVCYWNrKFwiQmFja0luT3V0XCIsIGZ1bmN0aW9uKHApIHtcblx0XHRcdFx0XHRyZXR1cm4gKChwICo9IDIpIDwgMSkgPyAwLjUgKiBwICogcCAqICgodGhpcy5fcDIgKyAxKSAqIHAgLSB0aGlzLl9wMikgOiAwLjUgKiAoKHAgLT0gMikgKiBwICogKCh0aGlzLl9wMiArIDEpICogcCArIHRoaXMuX3AyKSArIDIpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KSxcblxuXG5cdFx0XHQvL1Nsb3dNb1xuXHRcdFx0U2xvd01vID0gX2NsYXNzKFwiZWFzaW5nLlNsb3dNb1wiLCBmdW5jdGlvbihsaW5lYXJSYXRpbywgcG93ZXIsIHlveW9Nb2RlKSB7XG5cdFx0XHRcdHBvd2VyID0gKHBvd2VyIHx8IHBvd2VyID09PSAwKSA/IHBvd2VyIDogMC43O1xuXHRcdFx0XHRpZiAobGluZWFyUmF0aW8gPT0gbnVsbCkge1xuXHRcdFx0XHRcdGxpbmVhclJhdGlvID0gMC43O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGxpbmVhclJhdGlvID4gMSkge1xuXHRcdFx0XHRcdGxpbmVhclJhdGlvID0gMTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wID0gKGxpbmVhclJhdGlvICE9PSAxKSA/IHBvd2VyIDogMDtcblx0XHRcdFx0dGhpcy5fcDEgPSAoMSAtIGxpbmVhclJhdGlvKSAvIDI7XG5cdFx0XHRcdHRoaXMuX3AyID0gbGluZWFyUmF0aW87XG5cdFx0XHRcdHRoaXMuX3AzID0gdGhpcy5fcDEgKyB0aGlzLl9wMjtcblx0XHRcdFx0dGhpcy5fY2FsY0VuZCA9ICh5b3lvTW9kZSA9PT0gdHJ1ZSk7XG5cdFx0XHR9LCB0cnVlKSxcblx0XHRcdHAgPSBTbG93TW8ucHJvdG90eXBlID0gbmV3IEVhc2UoKSxcblx0XHRcdFN0ZXBwZWRFYXNlLCBSb3VnaEVhc2UsIF9jcmVhdGVFbGFzdGljO1xuXHRcdFx0XG5cdFx0cC5jb25zdHJ1Y3RvciA9IFNsb3dNbztcblx0XHRwLmdldFJhdGlvID0gZnVuY3Rpb24ocCkge1xuXHRcdFx0dmFyIHIgPSBwICsgKDAuNSAtIHApICogdGhpcy5fcDtcblx0XHRcdGlmIChwIDwgdGhpcy5fcDEpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NhbGNFbmQgPyAxIC0gKChwID0gMSAtIChwIC8gdGhpcy5fcDEpKSAqIHApIDogciAtICgocCA9IDEgLSAocCAvIHRoaXMuX3AxKSkgKiBwICogcCAqIHAgKiByKTtcblx0XHRcdH0gZWxzZSBpZiAocCA+IHRoaXMuX3AzKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jYWxjRW5kID8gMSAtIChwID0gKHAgLSB0aGlzLl9wMykgLyB0aGlzLl9wMSkgKiBwIDogciArICgocCAtIHIpICogKHAgPSAocCAtIHRoaXMuX3AzKSAvIHRoaXMuX3AxKSAqIHAgKiBwICogcCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FsY0VuZCA/IDEgOiByO1xuXHRcdH07XG5cdFx0U2xvd01vLmVhc2UgPSBuZXcgU2xvd01vKDAuNywgMC43KTtcblx0XHRcblx0XHRwLmNvbmZpZyA9IFNsb3dNby5jb25maWcgPSBmdW5jdGlvbihsaW5lYXJSYXRpbywgcG93ZXIsIHlveW9Nb2RlKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNsb3dNbyhsaW5lYXJSYXRpbywgcG93ZXIsIHlveW9Nb2RlKTtcblx0XHR9O1xuXG5cblx0XHQvL1N0ZXBwZWRFYXNlXG5cdFx0U3RlcHBlZEVhc2UgPSBfY2xhc3MoXCJlYXNpbmcuU3RlcHBlZEVhc2VcIiwgZnVuY3Rpb24oc3RlcHMpIHtcblx0XHRcdFx0c3RlcHMgPSBzdGVwcyB8fCAxO1xuXHRcdFx0XHR0aGlzLl9wMSA9IDEgLyBzdGVwcztcblx0XHRcdFx0dGhpcy5fcDIgPSBzdGVwcyArIDE7XG5cdFx0XHR9LCB0cnVlKTtcblx0XHRwID0gU3RlcHBlZEVhc2UucHJvdG90eXBlID0gbmV3IEVhc2UoKTtcdFxuXHRcdHAuY29uc3RydWN0b3IgPSBTdGVwcGVkRWFzZTtcblx0XHRwLmdldFJhdGlvID0gZnVuY3Rpb24ocCkge1xuXHRcdFx0aWYgKHAgPCAwKSB7XG5cdFx0XHRcdHAgPSAwO1xuXHRcdFx0fSBlbHNlIGlmIChwID49IDEpIHtcblx0XHRcdFx0cCA9IDAuOTk5OTk5OTk5O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICgodGhpcy5fcDIgKiBwKSA+PiAwKSAqIHRoaXMuX3AxO1xuXHRcdH07XG5cdFx0cC5jb25maWcgPSBTdGVwcGVkRWFzZS5jb25maWcgPSBmdW5jdGlvbihzdGVwcykge1xuXHRcdFx0cmV0dXJuIG5ldyBTdGVwcGVkRWFzZShzdGVwcyk7XG5cdFx0fTtcblxuXG5cdFx0Ly9Sb3VnaEVhc2Vcblx0XHRSb3VnaEVhc2UgPSBfY2xhc3MoXCJlYXNpbmcuUm91Z2hFYXNlXCIsIGZ1bmN0aW9uKHZhcnMpIHtcblx0XHRcdHZhcnMgPSB2YXJzIHx8IHt9O1xuXHRcdFx0dmFyIHRhcGVyID0gdmFycy50YXBlciB8fCBcIm5vbmVcIixcblx0XHRcdFx0YSA9IFtdLFxuXHRcdFx0XHRjbnQgPSAwLFxuXHRcdFx0XHRwb2ludHMgPSAodmFycy5wb2ludHMgfHwgMjApIHwgMCxcblx0XHRcdFx0aSA9IHBvaW50cyxcblx0XHRcdFx0cmFuZG9taXplID0gKHZhcnMucmFuZG9taXplICE9PSBmYWxzZSksXG5cdFx0XHRcdGNsYW1wID0gKHZhcnMuY2xhbXAgPT09IHRydWUpLFxuXHRcdFx0XHR0ZW1wbGF0ZSA9ICh2YXJzLnRlbXBsYXRlIGluc3RhbmNlb2YgRWFzZSkgPyB2YXJzLnRlbXBsYXRlIDogbnVsbCxcblx0XHRcdFx0c3RyZW5ndGggPSAodHlwZW9mKHZhcnMuc3RyZW5ndGgpID09PSBcIm51bWJlclwiKSA/IHZhcnMuc3RyZW5ndGggKiAwLjQgOiAwLjQsXG5cdFx0XHRcdHgsIHksIGJ1bXAsIGludlgsIG9iaiwgcG50O1xuXHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdHggPSByYW5kb21pemUgPyBNYXRoLnJhbmRvbSgpIDogKDEgLyBwb2ludHMpICogaTtcblx0XHRcdFx0eSA9IHRlbXBsYXRlID8gdGVtcGxhdGUuZ2V0UmF0aW8oeCkgOiB4O1xuXHRcdFx0XHRpZiAodGFwZXIgPT09IFwibm9uZVwiKSB7XG5cdFx0XHRcdFx0YnVtcCA9IHN0cmVuZ3RoO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRhcGVyID09PSBcIm91dFwiKSB7XG5cdFx0XHRcdFx0aW52WCA9IDEgLSB4O1xuXHRcdFx0XHRcdGJ1bXAgPSBpbnZYICogaW52WCAqIHN0cmVuZ3RoO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRhcGVyID09PSBcImluXCIpIHtcblx0XHRcdFx0XHRidW1wID0geCAqIHggKiBzdHJlbmd0aDtcblx0XHRcdFx0fSBlbHNlIGlmICh4IDwgMC41KSB7ICAvL1wiYm90aFwiIChzdGFydClcblx0XHRcdFx0XHRpbnZYID0geCAqIDI7XG5cdFx0XHRcdFx0YnVtcCA9IGludlggKiBpbnZYICogMC41ICogc3RyZW5ndGg7XG5cdFx0XHRcdH0gZWxzZSB7XHRcdFx0XHQvL1wiYm90aFwiIChlbmQpXG5cdFx0XHRcdFx0aW52WCA9ICgxIC0geCkgKiAyO1xuXHRcdFx0XHRcdGJ1bXAgPSBpbnZYICogaW52WCAqIDAuNSAqIHN0cmVuZ3RoO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyYW5kb21pemUpIHtcblx0XHRcdFx0XHR5ICs9IChNYXRoLnJhbmRvbSgpICogYnVtcCkgLSAoYnVtcCAqIDAuNSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaSAlIDIpIHtcblx0XHRcdFx0XHR5ICs9IGJ1bXAgKiAwLjU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0eSAtPSBidW1wICogMC41O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjbGFtcCkge1xuXHRcdFx0XHRcdGlmICh5ID4gMSkge1xuXHRcdFx0XHRcdFx0eSA9IDE7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh5IDwgMCkge1xuXHRcdFx0XHRcdFx0eSA9IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGFbY250KytdID0ge3g6eCwgeTp5fTtcblx0XHRcdH1cblx0XHRcdGEuc29ydChmdW5jdGlvbihhLCBiKSB7XG5cdFx0XHRcdHJldHVybiBhLnggLSBiLng7XG5cdFx0XHR9KTtcblxuXHRcdFx0cG50ID0gbmV3IEVhc2VQb2ludCgxLCAxLCBudWxsKTtcblx0XHRcdGkgPSBwb2ludHM7XG5cdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0b2JqID0gYVtpXTtcblx0XHRcdFx0cG50ID0gbmV3IEVhc2VQb2ludChvYmoueCwgb2JqLnksIHBudCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3ByZXYgPSBuZXcgRWFzZVBvaW50KDAsIDAsIChwbnQudCAhPT0gMCkgPyBwbnQgOiBwbnQubmV4dCk7XG5cdFx0fSwgdHJ1ZSk7XG5cdFx0cCA9IFJvdWdoRWFzZS5wcm90b3R5cGUgPSBuZXcgRWFzZSgpO1xuXHRcdHAuY29uc3RydWN0b3IgPSBSb3VnaEVhc2U7XG5cdFx0cC5nZXRSYXRpbyA9IGZ1bmN0aW9uKHApIHtcblx0XHRcdHZhciBwbnQgPSB0aGlzLl9wcmV2O1xuXHRcdFx0aWYgKHAgPiBwbnQudCkge1xuXHRcdFx0XHR3aGlsZSAocG50Lm5leHQgJiYgcCA+PSBwbnQudCkge1xuXHRcdFx0XHRcdHBudCA9IHBudC5uZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBudCA9IHBudC5wcmV2O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0d2hpbGUgKHBudC5wcmV2ICYmIHAgPD0gcG50LnQpIHtcblx0XHRcdFx0XHRwbnQgPSBwbnQucHJldjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJldiA9IHBudDtcblx0XHRcdHJldHVybiAocG50LnYgKyAoKHAgLSBwbnQudCkgLyBwbnQuZ2FwKSAqIHBudC5jKTtcblx0XHR9O1xuXHRcdHAuY29uZmlnID0gZnVuY3Rpb24odmFycykge1xuXHRcdFx0cmV0dXJuIG5ldyBSb3VnaEVhc2UodmFycyk7XG5cdFx0fTtcblx0XHRSb3VnaEVhc2UuZWFzZSA9IG5ldyBSb3VnaEVhc2UoKTtcblxuXG5cdFx0Ly9Cb3VuY2Vcblx0XHRfd3JhcChcIkJvdW5jZVwiLFxuXHRcdFx0X2NyZWF0ZShcIkJvdW5jZU91dFwiLCBmdW5jdGlvbihwKSB7XG5cdFx0XHRcdGlmIChwIDwgMSAvIDIuNzUpIHtcblx0XHRcdFx0XHRyZXR1cm4gNy41NjI1ICogcCAqIHA7XG5cdFx0XHRcdH0gZWxzZSBpZiAocCA8IDIgLyAyLjc1KSB7XG5cdFx0XHRcdFx0cmV0dXJuIDcuNTYyNSAqIChwIC09IDEuNSAvIDIuNzUpICogcCArIDAuNzU7XG5cdFx0XHRcdH0gZWxzZSBpZiAocCA8IDIuNSAvIDIuNzUpIHtcblx0XHRcdFx0XHRyZXR1cm4gNy41NjI1ICogKHAgLT0gMi4yNSAvIDIuNzUpICogcCArIDAuOTM3NTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gNy41NjI1ICogKHAgLT0gMi42MjUgLyAyLjc1KSAqIHAgKyAwLjk4NDM3NTtcblx0XHRcdH0pLFxuXHRcdFx0X2NyZWF0ZShcIkJvdW5jZUluXCIsIGZ1bmN0aW9uKHApIHtcblx0XHRcdFx0aWYgKChwID0gMSAtIHApIDwgMSAvIDIuNzUpIHtcblx0XHRcdFx0XHRyZXR1cm4gMSAtICg3LjU2MjUgKiBwICogcCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocCA8IDIgLyAyLjc1KSB7XG5cdFx0XHRcdFx0cmV0dXJuIDEgLSAoNy41NjI1ICogKHAgLT0gMS41IC8gMi43NSkgKiBwICsgMC43NSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocCA8IDIuNSAvIDIuNzUpIHtcblx0XHRcdFx0XHRyZXR1cm4gMSAtICg3LjU2MjUgKiAocCAtPSAyLjI1IC8gMi43NSkgKiBwICsgMC45Mzc1KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gMSAtICg3LjU2MjUgKiAocCAtPSAyLjYyNSAvIDIuNzUpICogcCArIDAuOTg0Mzc1KTtcblx0XHRcdH0pLFxuXHRcdFx0X2NyZWF0ZShcIkJvdW5jZUluT3V0XCIsIGZ1bmN0aW9uKHApIHtcblx0XHRcdFx0dmFyIGludmVydCA9IChwIDwgMC41KTtcblx0XHRcdFx0aWYgKGludmVydCkge1xuXHRcdFx0XHRcdHAgPSAxIC0gKHAgKiAyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwID0gKHAgKiAyKSAtIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHAgPCAxIC8gMi43NSkge1xuXHRcdFx0XHRcdHAgPSA3LjU2MjUgKiBwICogcDtcblx0XHRcdFx0fSBlbHNlIGlmIChwIDwgMiAvIDIuNzUpIHtcblx0XHRcdFx0XHRwID0gNy41NjI1ICogKHAgLT0gMS41IC8gMi43NSkgKiBwICsgMC43NTtcblx0XHRcdFx0fSBlbHNlIGlmIChwIDwgMi41IC8gMi43NSkge1xuXHRcdFx0XHRcdHAgPSA3LjU2MjUgKiAocCAtPSAyLjI1IC8gMi43NSkgKiBwICsgMC45Mzc1O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHAgPSA3LjU2MjUgKiAocCAtPSAyLjYyNSAvIDIuNzUpICogcCArIDAuOTg0Mzc1O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpbnZlcnQgPyAoMSAtIHApICogMC41IDogcCAqIDAuNSArIDAuNTtcblx0XHRcdH0pXG5cdFx0KTtcblxuXG5cdFx0Ly9DSVJDXG5cdFx0X3dyYXAoXCJDaXJjXCIsXG5cdFx0XHRfY3JlYXRlKFwiQ2lyY091dFwiLCBmdW5jdGlvbihwKSB7XG5cdFx0XHRcdHJldHVybiBNYXRoLnNxcnQoMSAtIChwID0gcCAtIDEpICogcCk7XG5cdFx0XHR9KSxcblx0XHRcdF9jcmVhdGUoXCJDaXJjSW5cIiwgZnVuY3Rpb24ocCkge1xuXHRcdFx0XHRyZXR1cm4gLShNYXRoLnNxcnQoMSAtIChwICogcCkpIC0gMSk7XG5cdFx0XHR9KSxcblx0XHRcdF9jcmVhdGUoXCJDaXJjSW5PdXRcIiwgZnVuY3Rpb24ocCkge1xuXHRcdFx0XHRyZXR1cm4gKChwKj0yKSA8IDEpID8gLTAuNSAqIChNYXRoLnNxcnQoMSAtIHAgKiBwKSAtIDEpIDogMC41ICogKE1hdGguc3FydCgxIC0gKHAgLT0gMikgKiBwKSArIDEpO1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cblx0XHQvL0VsYXN0aWNcblx0XHRfY3JlYXRlRWxhc3RpYyA9IGZ1bmN0aW9uKG4sIGYsIGRlZikge1xuXHRcdFx0dmFyIEMgPSBfY2xhc3MoXCJlYXNpbmcuXCIgKyBuLCBmdW5jdGlvbihhbXBsaXR1ZGUsIHBlcmlvZCkge1xuXHRcdFx0XHRcdHRoaXMuX3AxID0gKGFtcGxpdHVkZSA+PSAxKSA/IGFtcGxpdHVkZSA6IDE7IC8vbm90ZTogaWYgYW1wbGl0dWRlIGlzIDwgMSwgd2Ugc2ltcGx5IGFkanVzdCB0aGUgcGVyaW9kIGZvciBhIG1vcmUgbmF0dXJhbCBmZWVsLiBPdGhlcndpc2UgdGhlIG1hdGggZG9lc24ndCB3b3JrIHJpZ2h0IGFuZCB0aGUgY3VydmUgc3RhcnRzIGF0IDEuXG5cdFx0XHRcdFx0dGhpcy5fcDIgPSAocGVyaW9kIHx8IGRlZikgLyAoYW1wbGl0dWRlIDwgMSA/IGFtcGxpdHVkZSA6IDEpO1xuXHRcdFx0XHRcdHRoaXMuX3AzID0gdGhpcy5fcDIgLyBfMlBJICogKE1hdGguYXNpbigxIC8gdGhpcy5fcDEpIHx8IDApO1xuXHRcdFx0XHRcdHRoaXMuX3AyID0gXzJQSSAvIHRoaXMuX3AyOyAvL3ByZWNhbGN1bGF0ZSB0byBvcHRpbWl6ZVxuXHRcdFx0XHR9LCB0cnVlKSxcblx0XHRcdFx0cCA9IEMucHJvdG90eXBlID0gbmV3IEVhc2UoKTtcblx0XHRcdHAuY29uc3RydWN0b3IgPSBDO1xuXHRcdFx0cC5nZXRSYXRpbyA9IGY7XG5cdFx0XHRwLmNvbmZpZyA9IGZ1bmN0aW9uKGFtcGxpdHVkZSwgcGVyaW9kKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgQyhhbXBsaXR1ZGUsIHBlcmlvZCk7XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIEM7XG5cdFx0fTtcblx0XHRfd3JhcChcIkVsYXN0aWNcIixcblx0XHRcdF9jcmVhdGVFbGFzdGljKFwiRWxhc3RpY091dFwiLCBmdW5jdGlvbihwKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wMSAqIE1hdGgucG93KDIsIC0xMCAqIHApICogTWF0aC5zaW4oIChwIC0gdGhpcy5fcDMpICogdGhpcy5fcDIgKSArIDE7XG5cdFx0XHR9LCAwLjMpLFxuXHRcdFx0X2NyZWF0ZUVsYXN0aWMoXCJFbGFzdGljSW5cIiwgZnVuY3Rpb24ocCkge1xuXHRcdFx0XHRyZXR1cm4gLSh0aGlzLl9wMSAqIE1hdGgucG93KDIsIDEwICogKHAgLT0gMSkpICogTWF0aC5zaW4oIChwIC0gdGhpcy5fcDMpICogdGhpcy5fcDIgKSk7XG5cdFx0XHR9LCAwLjMpLFxuXHRcdFx0X2NyZWF0ZUVsYXN0aWMoXCJFbGFzdGljSW5PdXRcIiwgZnVuY3Rpb24ocCkge1xuXHRcdFx0XHRyZXR1cm4gKChwICo9IDIpIDwgMSkgPyAtMC41ICogKHRoaXMuX3AxICogTWF0aC5wb3coMiwgMTAgKiAocCAtPSAxKSkgKiBNYXRoLnNpbiggKHAgLSB0aGlzLl9wMykgKiB0aGlzLl9wMikpIDogdGhpcy5fcDEgKiBNYXRoLnBvdygyLCAtMTAgKihwIC09IDEpKSAqIE1hdGguc2luKCAocCAtIHRoaXMuX3AzKSAqIHRoaXMuX3AyICkgKiAwLjUgKyAxO1xuXHRcdFx0fSwgMC40NSlcblx0XHQpO1xuXG5cblx0XHQvL0V4cG9cblx0XHRfd3JhcChcIkV4cG9cIixcblx0XHRcdF9jcmVhdGUoXCJFeHBvT3V0XCIsIGZ1bmN0aW9uKHApIHtcblx0XHRcdFx0cmV0dXJuIDEgLSBNYXRoLnBvdygyLCAtMTAgKiBwKTtcblx0XHRcdH0pLFxuXHRcdFx0X2NyZWF0ZShcIkV4cG9JblwiLCBmdW5jdGlvbihwKSB7XG5cdFx0XHRcdHJldHVybiBNYXRoLnBvdygyLCAxMCAqIChwIC0gMSkpIC0gMC4wMDE7XG5cdFx0XHR9KSxcblx0XHRcdF9jcmVhdGUoXCJFeHBvSW5PdXRcIiwgZnVuY3Rpb24ocCkge1xuXHRcdFx0XHRyZXR1cm4gKChwICo9IDIpIDwgMSkgPyAwLjUgKiBNYXRoLnBvdygyLCAxMCAqIChwIC0gMSkpIDogMC41ICogKDIgLSBNYXRoLnBvdygyLCAtMTAgKiAocCAtIDEpKSk7XG5cdFx0XHR9KVxuXHRcdCk7XG5cblxuXHRcdC8vU2luZVxuXHRcdF93cmFwKFwiU2luZVwiLFxuXHRcdFx0X2NyZWF0ZShcIlNpbmVPdXRcIiwgZnVuY3Rpb24ocCkge1xuXHRcdFx0XHRyZXR1cm4gTWF0aC5zaW4ocCAqIF9IQUxGX1BJKTtcblx0XHRcdH0pLFxuXHRcdFx0X2NyZWF0ZShcIlNpbmVJblwiLCBmdW5jdGlvbihwKSB7XG5cdFx0XHRcdHJldHVybiAtTWF0aC5jb3MocCAqIF9IQUxGX1BJKSArIDE7XG5cdFx0XHR9KSxcblx0XHRcdF9jcmVhdGUoXCJTaW5lSW5PdXRcIiwgZnVuY3Rpb24ocCkge1xuXHRcdFx0XHRyZXR1cm4gLTAuNSAqIChNYXRoLmNvcyhNYXRoLlBJICogcCkgLSAxKTtcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdF9jbGFzcyhcImVhc2luZy5FYXNlTG9va3VwXCIsIHtcblx0XHRcdFx0ZmluZDpmdW5jdGlvbihzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEVhc2UubWFwW3NdO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0cnVlKTtcblxuXHRcdC8vcmVnaXN0ZXIgdGhlIG5vbi1zdGFuZGFyZCBlYXNlc1xuXHRcdF9lYXNlUmVnKHcuU2xvd01vLCBcIlNsb3dNb1wiLCBcImVhc2UsXCIpO1xuXHRcdF9lYXNlUmVnKFJvdWdoRWFzZSwgXCJSb3VnaEVhc2VcIiwgXCJlYXNlLFwiKTtcblx0XHRfZWFzZVJlZyhTdGVwcGVkRWFzZSwgXCJTdGVwcGVkRWFzZVwiLCBcImVhc2UsXCIpO1xuXHRcdFxuXHRcdHJldHVybiBCYWNrO1xuXHRcdFxuXHR9LCB0cnVlKTtcblxufSk7IGlmIChfZ3NTY29wZS5fZ3NEZWZpbmUpIHsgX2dzU2NvcGUuX2dzUXVldWUucG9wKCkoKTsgfSIsIi8qIVxuICogVkVSU0lPTjogMS4xOC4wXG4gKiBEQVRFOiAyMDE1LTA4LTI5XG4gKiBVUERBVEVTIEFORCBET0NTIEFUOiBodHRwOi8vZ3JlZW5zb2NrLmNvbVxuICpcbiAqIEBsaWNlbnNlIENvcHlyaWdodCAoYykgMjAwOC0yMDE1LCBHcmVlblNvY2suIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIHdvcmsgaXMgc3ViamVjdCB0byB0aGUgdGVybXMgYXQgaHR0cDovL2dyZWVuc29jay5jb20vc3RhbmRhcmQtbGljZW5zZSBvciBmb3JcbiAqIENsdWIgR3JlZW5Tb2NrIG1lbWJlcnMsIHRoZSBzb2Z0d2FyZSBhZ3JlZW1lbnQgdGhhdCB3YXMgaXNzdWVkIHdpdGggeW91ciBtZW1iZXJzaGlwLlxuICogXG4gKiBAYXV0aG9yOiBKYWNrIERveWxlLCBqYWNrQGdyZWVuc29jay5jb21cbiAqL1xudmFyIF9nc1Njb3BlID0gKHR5cGVvZihtb2R1bGUpICE9PSBcInVuZGVmaW5lZFwiICYmIG1vZHVsZS5leHBvcnRzICYmIHR5cGVvZihnbG9iYWwpICE9PSBcInVuZGVmaW5lZFwiKSA/IGdsb2JhbCA6IHRoaXMgfHwgd2luZG93OyAvL2hlbHBzIGVuc3VyZSBjb21wYXRpYmlsaXR5IHdpdGggQU1EL1JlcXVpcmVKUyBhbmQgQ29tbW9uSlMvTm9kZVxuKF9nc1Njb3BlLl9nc1F1ZXVlIHx8IChfZ3NTY29wZS5fZ3NRdWV1ZSA9IFtdKSkucHVzaCggZnVuY3Rpb24oKSB7XG5cblx0XCJ1c2Ugc3RyaWN0XCI7XG5cblx0X2dzU2NvcGUuX2dzRGVmaW5lKFwiVGltZWxpbmVMaXRlXCIsIFtcImNvcmUuQW5pbWF0aW9uXCIsXCJjb3JlLlNpbXBsZVRpbWVsaW5lXCIsXCJUd2VlbkxpdGVcIl0sIGZ1bmN0aW9uKEFuaW1hdGlvbiwgU2ltcGxlVGltZWxpbmUsIFR3ZWVuTGl0ZSkge1xuXG5cdFx0dmFyIFRpbWVsaW5lTGl0ZSA9IGZ1bmN0aW9uKHZhcnMpIHtcblx0XHRcdFx0U2ltcGxlVGltZWxpbmUuY2FsbCh0aGlzLCB2YXJzKTtcblx0XHRcdFx0dGhpcy5fbGFiZWxzID0ge307XG5cdFx0XHRcdHRoaXMuYXV0b1JlbW92ZUNoaWxkcmVuID0gKHRoaXMudmFycy5hdXRvUmVtb3ZlQ2hpbGRyZW4gPT09IHRydWUpO1xuXHRcdFx0XHR0aGlzLnNtb290aENoaWxkVGltaW5nID0gKHRoaXMudmFycy5zbW9vdGhDaGlsZFRpbWluZyA9PT0gdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX3NvcnRDaGlsZHJlbiA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX29uVXBkYXRlID0gdGhpcy52YXJzLm9uVXBkYXRlO1xuXHRcdFx0XHR2YXIgdiA9IHRoaXMudmFycyxcblx0XHRcdFx0XHR2YWwsIHA7XG5cdFx0XHRcdGZvciAocCBpbiB2KSB7XG5cdFx0XHRcdFx0dmFsID0gdltwXTtcblx0XHRcdFx0XHRpZiAoX2lzQXJyYXkodmFsKSkgaWYgKHZhbC5qb2luKFwiXCIpLmluZGV4T2YoXCJ7c2VsZn1cIikgIT09IC0xKSB7XG5cdFx0XHRcdFx0XHR2W3BdID0gdGhpcy5fc3dhcFNlbGZJblBhcmFtcyh2YWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoX2lzQXJyYXkodi50d2VlbnMpKSB7XG5cdFx0XHRcdFx0dGhpcy5hZGQodi50d2VlbnMsIDAsIHYuYWxpZ24sIHYuc3RhZ2dlcik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRfdGlueU51bSA9IDAuMDAwMDAwMDAwMSxcblx0XHRcdFR3ZWVuTGl0ZUludGVybmFscyA9IFR3ZWVuTGl0ZS5faW50ZXJuYWxzLFxuXHRcdFx0X2ludGVybmFscyA9IFRpbWVsaW5lTGl0ZS5faW50ZXJuYWxzID0ge30sXG5cdFx0XHRfaXNTZWxlY3RvciA9IFR3ZWVuTGl0ZUludGVybmFscy5pc1NlbGVjdG9yLFxuXHRcdFx0X2lzQXJyYXkgPSBUd2VlbkxpdGVJbnRlcm5hbHMuaXNBcnJheSxcblx0XHRcdF9sYXp5VHdlZW5zID0gVHdlZW5MaXRlSW50ZXJuYWxzLmxhenlUd2VlbnMsXG5cdFx0XHRfbGF6eVJlbmRlciA9IFR3ZWVuTGl0ZUludGVybmFscy5sYXp5UmVuZGVyLFxuXHRcdFx0X2dsb2JhbHMgPSBfZ3NTY29wZS5fZ3NEZWZpbmUuZ2xvYmFscyxcblx0XHRcdF9jb3B5ID0gZnVuY3Rpb24odmFycykge1xuXHRcdFx0XHR2YXIgY29weSA9IHt9LCBwO1xuXHRcdFx0XHRmb3IgKHAgaW4gdmFycykge1xuXHRcdFx0XHRcdGNvcHlbcF0gPSB2YXJzW3BdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBjb3B5O1xuXHRcdFx0fSxcblx0XHRcdF9hcHBseUN5Y2xlID0gZnVuY3Rpb24odmFycywgdGFyZ2V0cywgaSkge1xuXHRcdFx0XHR2YXIgYWx0ID0gdmFycy5jeWNsZSxcblx0XHRcdFx0XHRwLCB2YWw7XG5cdFx0XHRcdGZvciAocCBpbiBhbHQpIHtcblx0XHRcdFx0XHR2YWwgPSBhbHRbcF07XG5cdFx0XHRcdFx0dmFyc1twXSA9ICh0eXBlb2YodmFsKSA9PT0gXCJmdW5jdGlvblwiKSA/IHZhbC5jYWxsKHRhcmdldHNbaV0sIGkpIDogdmFsW2kgJSB2YWwubGVuZ3RoXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWxldGUgdmFycy5jeWNsZTtcblx0XHRcdH0sXG5cdFx0XHRfcGF1c2VDYWxsYmFjayA9IF9pbnRlcm5hbHMucGF1c2VDYWxsYmFjayA9IGZ1bmN0aW9uKCkge30sXG5cdFx0XHRfc2xpY2UgPSBmdW5jdGlvbihhKSB7IC8vZG9uJ3QgdXNlIFtdLnNsaWNlIGJlY2F1c2UgdGhhdCBkb2Vzbid0IHdvcmsgaW4gSUU4IHdpdGggYSBOb2RlTGlzdCB0aGF0J3MgcmV0dXJuZWQgYnkgcXVlcnlTZWxlY3RvckFsbCgpXG5cdFx0XHRcdHZhciBiID0gW10sXG5cdFx0XHRcdFx0bCA9IGEubGVuZ3RoLFxuXHRcdFx0XHRcdGk7XG5cdFx0XHRcdGZvciAoaSA9IDA7IGkgIT09IGw7IGIucHVzaChhW2krK10pKTtcblx0XHRcdFx0cmV0dXJuIGI7XG5cdFx0XHR9LFxuXHRcdFx0cCA9IFRpbWVsaW5lTGl0ZS5wcm90b3R5cGUgPSBuZXcgU2ltcGxlVGltZWxpbmUoKTtcblxuXHRcdFRpbWVsaW5lTGl0ZS52ZXJzaW9uID0gXCIxLjE4LjBcIjtcblx0XHRwLmNvbnN0cnVjdG9yID0gVGltZWxpbmVMaXRlO1xuXHRcdHAua2lsbCgpLl9nYyA9IHAuX2ZvcmNpbmdQbGF5aGVhZCA9IHAuX2hhc1BhdXNlID0gZmFsc2U7XG5cblx0XHQvKiBtaWdodCB1c2UgbGF0ZXIuLi5cblx0XHQvL3RyYW5zbGF0ZXMgYSBsb2NhbCB0aW1lIGluc2lkZSBhbiBhbmltYXRpb24gdG8gdGhlIGNvcnJlc3BvbmRpbmcgdGltZSBvbiB0aGUgcm9vdC9nbG9iYWwgdGltZWxpbmUsIGZhY3RvcmluZyBpbiBhbGwgbmVzdGluZyBhbmQgdGltZVNjYWxlcy5cblx0XHRmdW5jdGlvbiBsb2NhbFRvR2xvYmFsKHRpbWUsIGFuaW1hdGlvbikge1xuXHRcdFx0d2hpbGUgKGFuaW1hdGlvbikge1xuXHRcdFx0XHR0aW1lID0gKHRpbWUgLyBhbmltYXRpb24uX3RpbWVTY2FsZSkgKyBhbmltYXRpb24uX3N0YXJ0VGltZTtcblx0XHRcdFx0YW5pbWF0aW9uID0gYW5pbWF0aW9uLnRpbWVsaW5lO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRpbWU7XG5cdFx0fVxuXG5cdFx0Ly90cmFuc2xhdGVzIHRoZSBzdXBwbGllZCB0aW1lIG9uIHRoZSByb290L2dsb2JhbCB0aW1lbGluZSBpbnRvIHRoZSBjb3JyZXNwb25kaW5nIGxvY2FsIHRpbWUgaW5zaWRlIGEgcGFydGljdWxhciBhbmltYXRpb24sIGZhY3RvcmluZyBpbiBhbGwgbmVzdGluZyBhbmQgdGltZVNjYWxlc1xuXHRcdGZ1bmN0aW9uIGdsb2JhbFRvTG9jYWwodGltZSwgYW5pbWF0aW9uKSB7XG5cdFx0XHR2YXIgc2NhbGUgPSAxO1xuXHRcdFx0dGltZSAtPSBsb2NhbFRvR2xvYmFsKDAsIGFuaW1hdGlvbik7XG5cdFx0XHR3aGlsZSAoYW5pbWF0aW9uKSB7XG5cdFx0XHRcdHNjYWxlICo9IGFuaW1hdGlvbi5fdGltZVNjYWxlO1xuXHRcdFx0XHRhbmltYXRpb24gPSBhbmltYXRpb24udGltZWxpbmU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGltZSAqIHNjYWxlO1xuXHRcdH1cblx0XHQqL1xuXG5cdFx0cC50byA9IGZ1bmN0aW9uKHRhcmdldCwgZHVyYXRpb24sIHZhcnMsIHBvc2l0aW9uKSB7XG5cdFx0XHR2YXIgRW5naW5lID0gKHZhcnMucmVwZWF0ICYmIF9nbG9iYWxzLlR3ZWVuTWF4KSB8fCBUd2VlbkxpdGU7XG5cdFx0XHRyZXR1cm4gZHVyYXRpb24gPyB0aGlzLmFkZCggbmV3IEVuZ2luZSh0YXJnZXQsIGR1cmF0aW9uLCB2YXJzKSwgcG9zaXRpb24pIDogdGhpcy5zZXQodGFyZ2V0LCB2YXJzLCBwb3NpdGlvbik7XG5cdFx0fTtcblxuXHRcdHAuZnJvbSA9IGZ1bmN0aW9uKHRhcmdldCwgZHVyYXRpb24sIHZhcnMsIHBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hZGQoICgodmFycy5yZXBlYXQgJiYgX2dsb2JhbHMuVHdlZW5NYXgpIHx8IFR3ZWVuTGl0ZSkuZnJvbSh0YXJnZXQsIGR1cmF0aW9uLCB2YXJzKSwgcG9zaXRpb24pO1xuXHRcdH07XG5cblx0XHRwLmZyb21UbyA9IGZ1bmN0aW9uKHRhcmdldCwgZHVyYXRpb24sIGZyb21WYXJzLCB0b1ZhcnMsIHBvc2l0aW9uKSB7XG5cdFx0XHR2YXIgRW5naW5lID0gKHRvVmFycy5yZXBlYXQgJiYgX2dsb2JhbHMuVHdlZW5NYXgpIHx8IFR3ZWVuTGl0ZTtcblx0XHRcdHJldHVybiBkdXJhdGlvbiA/IHRoaXMuYWRkKCBFbmdpbmUuZnJvbVRvKHRhcmdldCwgZHVyYXRpb24sIGZyb21WYXJzLCB0b1ZhcnMpLCBwb3NpdGlvbikgOiB0aGlzLnNldCh0YXJnZXQsIHRvVmFycywgcG9zaXRpb24pO1xuXHRcdH07XG5cblx0XHRwLnN0YWdnZXJUbyA9IGZ1bmN0aW9uKHRhcmdldHMsIGR1cmF0aW9uLCB2YXJzLCBzdGFnZ2VyLCBwb3NpdGlvbiwgb25Db21wbGV0ZUFsbCwgb25Db21wbGV0ZUFsbFBhcmFtcywgb25Db21wbGV0ZUFsbFNjb3BlKSB7XG5cdFx0XHR2YXIgdGwgPSBuZXcgVGltZWxpbmVMaXRlKHtvbkNvbXBsZXRlOm9uQ29tcGxldGVBbGwsIG9uQ29tcGxldGVQYXJhbXM6b25Db21wbGV0ZUFsbFBhcmFtcywgY2FsbGJhY2tTY29wZTpvbkNvbXBsZXRlQWxsU2NvcGUsIHNtb290aENoaWxkVGltaW5nOnRoaXMuc21vb3RoQ2hpbGRUaW1pbmd9KSxcblx0XHRcdFx0Y3ljbGUgPSB2YXJzLmN5Y2xlLFxuXHRcdFx0XHRjb3B5LCBpO1xuXHRcdFx0aWYgKHR5cGVvZih0YXJnZXRzKSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0XHR0YXJnZXRzID0gVHdlZW5MaXRlLnNlbGVjdG9yKHRhcmdldHMpIHx8IHRhcmdldHM7XG5cdFx0XHR9XG5cdFx0XHR0YXJnZXRzID0gdGFyZ2V0cyB8fCBbXTtcblx0XHRcdGlmIChfaXNTZWxlY3Rvcih0YXJnZXRzKSkgeyAvL3NlbnNlcyBpZiB0aGUgdGFyZ2V0cyBvYmplY3QgaXMgYSBzZWxlY3Rvci4gSWYgaXQgaXMsIHdlIHNob3VsZCB0cmFuc2xhdGUgaXQgaW50byBhbiBhcnJheS5cblx0XHRcdFx0dGFyZ2V0cyA9IF9zbGljZSh0YXJnZXRzKTtcblx0XHRcdH1cblx0XHRcdHN0YWdnZXIgPSBzdGFnZ2VyIHx8IDA7XG5cdFx0XHRpZiAoc3RhZ2dlciA8IDApIHtcblx0XHRcdFx0dGFyZ2V0cyA9IF9zbGljZSh0YXJnZXRzKTtcblx0XHRcdFx0dGFyZ2V0cy5yZXZlcnNlKCk7XG5cdFx0XHRcdHN0YWdnZXIgKj0gLTE7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgdGFyZ2V0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb3B5ID0gX2NvcHkodmFycyk7XG5cdFx0XHRcdGlmIChjb3B5LnN0YXJ0QXQpIHtcblx0XHRcdFx0XHRjb3B5LnN0YXJ0QXQgPSBfY29weShjb3B5LnN0YXJ0QXQpO1xuXHRcdFx0XHRcdGlmIChjb3B5LnN0YXJ0QXQuY3ljbGUpIHtcblx0XHRcdFx0XHRcdF9hcHBseUN5Y2xlKGNvcHkuc3RhcnRBdCwgdGFyZ2V0cywgaSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjeWNsZSkge1xuXHRcdFx0XHRcdF9hcHBseUN5Y2xlKGNvcHksIHRhcmdldHMsIGkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRsLnRvKHRhcmdldHNbaV0sIGR1cmF0aW9uLCBjb3B5LCBpICogc3RhZ2dlcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5hZGQodGwsIHBvc2l0aW9uKTtcblx0XHR9O1xuXG5cdFx0cC5zdGFnZ2VyRnJvbSA9IGZ1bmN0aW9uKHRhcmdldHMsIGR1cmF0aW9uLCB2YXJzLCBzdGFnZ2VyLCBwb3NpdGlvbiwgb25Db21wbGV0ZUFsbCwgb25Db21wbGV0ZUFsbFBhcmFtcywgb25Db21wbGV0ZUFsbFNjb3BlKSB7XG5cdFx0XHR2YXJzLmltbWVkaWF0ZVJlbmRlciA9ICh2YXJzLmltbWVkaWF0ZVJlbmRlciAhPSBmYWxzZSk7XG5cdFx0XHR2YXJzLnJ1bkJhY2t3YXJkcyA9IHRydWU7XG5cdFx0XHRyZXR1cm4gdGhpcy5zdGFnZ2VyVG8odGFyZ2V0cywgZHVyYXRpb24sIHZhcnMsIHN0YWdnZXIsIHBvc2l0aW9uLCBvbkNvbXBsZXRlQWxsLCBvbkNvbXBsZXRlQWxsUGFyYW1zLCBvbkNvbXBsZXRlQWxsU2NvcGUpO1xuXHRcdH07XG5cblx0XHRwLnN0YWdnZXJGcm9tVG8gPSBmdW5jdGlvbih0YXJnZXRzLCBkdXJhdGlvbiwgZnJvbVZhcnMsIHRvVmFycywgc3RhZ2dlciwgcG9zaXRpb24sIG9uQ29tcGxldGVBbGwsIG9uQ29tcGxldGVBbGxQYXJhbXMsIG9uQ29tcGxldGVBbGxTY29wZSkge1xuXHRcdFx0dG9WYXJzLnN0YXJ0QXQgPSBmcm9tVmFycztcblx0XHRcdHRvVmFycy5pbW1lZGlhdGVSZW5kZXIgPSAodG9WYXJzLmltbWVkaWF0ZVJlbmRlciAhPSBmYWxzZSAmJiBmcm9tVmFycy5pbW1lZGlhdGVSZW5kZXIgIT0gZmFsc2UpO1xuXHRcdFx0cmV0dXJuIHRoaXMuc3RhZ2dlclRvKHRhcmdldHMsIGR1cmF0aW9uLCB0b1ZhcnMsIHN0YWdnZXIsIHBvc2l0aW9uLCBvbkNvbXBsZXRlQWxsLCBvbkNvbXBsZXRlQWxsUGFyYW1zLCBvbkNvbXBsZXRlQWxsU2NvcGUpO1xuXHRcdH07XG5cblx0XHRwLmNhbGwgPSBmdW5jdGlvbihjYWxsYmFjaywgcGFyYW1zLCBzY29wZSwgcG9zaXRpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmFkZCggVHdlZW5MaXRlLmRlbGF5ZWRDYWxsKDAsIGNhbGxiYWNrLCBwYXJhbXMsIHNjb3BlKSwgcG9zaXRpb24pO1xuXHRcdH07XG5cblx0XHRwLnNldCA9IGZ1bmN0aW9uKHRhcmdldCwgdmFycywgcG9zaXRpb24pIHtcblx0XHRcdHBvc2l0aW9uID0gdGhpcy5fcGFyc2VUaW1lT3JMYWJlbChwb3NpdGlvbiwgMCwgdHJ1ZSk7XG5cdFx0XHRpZiAodmFycy5pbW1lZGlhdGVSZW5kZXIgPT0gbnVsbCkge1xuXHRcdFx0XHR2YXJzLmltbWVkaWF0ZVJlbmRlciA9IChwb3NpdGlvbiA9PT0gdGhpcy5fdGltZSAmJiAhdGhpcy5fcGF1c2VkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmFkZCggbmV3IFR3ZWVuTGl0ZSh0YXJnZXQsIDAsIHZhcnMpLCBwb3NpdGlvbik7XG5cdFx0fTtcblxuXHRcdFRpbWVsaW5lTGl0ZS5leHBvcnRSb290ID0gZnVuY3Rpb24odmFycywgaWdub3JlRGVsYXllZENhbGxzKSB7XG5cdFx0XHR2YXJzID0gdmFycyB8fCB7fTtcblx0XHRcdGlmICh2YXJzLnNtb290aENoaWxkVGltaW5nID09IG51bGwpIHtcblx0XHRcdFx0dmFycy5zbW9vdGhDaGlsZFRpbWluZyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHR2YXIgdGwgPSBuZXcgVGltZWxpbmVMaXRlKHZhcnMpLFxuXHRcdFx0XHRyb290ID0gdGwuX3RpbWVsaW5lLFxuXHRcdFx0XHR0d2VlbiwgbmV4dDtcblx0XHRcdGlmIChpZ25vcmVEZWxheWVkQ2FsbHMgPT0gbnVsbCkge1xuXHRcdFx0XHRpZ25vcmVEZWxheWVkQ2FsbHMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cm9vdC5fcmVtb3ZlKHRsLCB0cnVlKTtcblx0XHRcdHRsLl9zdGFydFRpbWUgPSAwO1xuXHRcdFx0dGwuX3Jhd1ByZXZUaW1lID0gdGwuX3RpbWUgPSB0bC5fdG90YWxUaW1lID0gcm9vdC5fdGltZTtcblx0XHRcdHR3ZWVuID0gcm9vdC5fZmlyc3Q7XG5cdFx0XHR3aGlsZSAodHdlZW4pIHtcblx0XHRcdFx0bmV4dCA9IHR3ZWVuLl9uZXh0O1xuXHRcdFx0XHRpZiAoIWlnbm9yZURlbGF5ZWRDYWxscyB8fCAhKHR3ZWVuIGluc3RhbmNlb2YgVHdlZW5MaXRlICYmIHR3ZWVuLnRhcmdldCA9PT0gdHdlZW4udmFycy5vbkNvbXBsZXRlKSkge1xuXHRcdFx0XHRcdHRsLmFkZCh0d2VlbiwgdHdlZW4uX3N0YXJ0VGltZSAtIHR3ZWVuLl9kZWxheSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHdlZW4gPSBuZXh0O1xuXHRcdFx0fVxuXHRcdFx0cm9vdC5hZGQodGwsIDApO1xuXHRcdFx0cmV0dXJuIHRsO1xuXHRcdH07XG5cblx0XHRwLmFkZCA9IGZ1bmN0aW9uKHZhbHVlLCBwb3NpdGlvbiwgYWxpZ24sIHN0YWdnZXIpIHtcblx0XHRcdHZhciBjdXJUaW1lLCBsLCBpLCBjaGlsZCwgdGwsIGJlZm9yZVJhd1RpbWU7XG5cdFx0XHRpZiAodHlwZW9mKHBvc2l0aW9uKSAhPT0gXCJudW1iZXJcIikge1xuXHRcdFx0XHRwb3NpdGlvbiA9IHRoaXMuX3BhcnNlVGltZU9yTGFiZWwocG9zaXRpb24sIDAsIHRydWUsIHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGlmICghKHZhbHVlIGluc3RhbmNlb2YgQW5pbWF0aW9uKSkge1xuXHRcdFx0XHRpZiAoKHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHx8ICh2YWx1ZSAmJiB2YWx1ZS5wdXNoICYmIF9pc0FycmF5KHZhbHVlKSkpIHtcblx0XHRcdFx0XHRhbGlnbiA9IGFsaWduIHx8IFwibm9ybWFsXCI7XG5cdFx0XHRcdFx0c3RhZ2dlciA9IHN0YWdnZXIgfHwgMDtcblx0XHRcdFx0XHRjdXJUaW1lID0gcG9zaXRpb247XG5cdFx0XHRcdFx0bCA9IHZhbHVlLmxlbmd0aDtcblx0XHRcdFx0XHRmb3IgKGkgPSAwOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRpZiAoX2lzQXJyYXkoY2hpbGQgPSB2YWx1ZVtpXSkpIHtcblx0XHRcdFx0XHRcdFx0Y2hpbGQgPSBuZXcgVGltZWxpbmVMaXRlKHt0d2VlbnM6Y2hpbGR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuYWRkKGNoaWxkLCBjdXJUaW1lKTtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YoY2hpbGQpICE9PSBcInN0cmluZ1wiICYmIHR5cGVvZihjaGlsZCkgIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRcdFx0XHRpZiAoYWxpZ24gPT09IFwic2VxdWVuY2VcIikge1xuXHRcdFx0XHRcdFx0XHRcdGN1clRpbWUgPSBjaGlsZC5fc3RhcnRUaW1lICsgKGNoaWxkLnRvdGFsRHVyYXRpb24oKSAvIGNoaWxkLl90aW1lU2NhbGUpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGFsaWduID09PSBcInN0YXJ0XCIpIHtcblx0XHRcdFx0XHRcdFx0XHRjaGlsZC5fc3RhcnRUaW1lIC09IGNoaWxkLmRlbGF5KCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGN1clRpbWUgKz0gc3RhZ2dlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3VuY2FjaGUodHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mKHZhbHVlKSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmFkZExhYmVsKHZhbHVlLCBwb3NpdGlvbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mKHZhbHVlKSA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdFx0dmFsdWUgPSBUd2VlbkxpdGUuZGVsYXllZENhbGwoMCwgdmFsdWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93KFwiQ2Fubm90IGFkZCBcIiArIHZhbHVlICsgXCIgaW50byB0aGUgdGltZWxpbmU7IGl0IGlzIG5vdCBhIHR3ZWVuLCB0aW1lbGluZSwgZnVuY3Rpb24sIG9yIHN0cmluZy5cIik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0U2ltcGxlVGltZWxpbmUucHJvdG90eXBlLmFkZC5jYWxsKHRoaXMsIHZhbHVlLCBwb3NpdGlvbik7XG5cblx0XHRcdC8vaWYgdGhlIHRpbWVsaW5lIGhhcyBhbHJlYWR5IGVuZGVkIGJ1dCB0aGUgaW5zZXJ0ZWQgdHdlZW4vdGltZWxpbmUgZXh0ZW5kcyB0aGUgZHVyYXRpb24sIHdlIHNob3VsZCBlbmFibGUgdGhpcyB0aW1lbGluZSBhZ2FpbiBzbyB0aGF0IGl0IHJlbmRlcnMgcHJvcGVybHkuIFdlIHNob3VsZCBhbHNvIGFsaWduIHRoZSBwbGF5aGVhZCB3aXRoIHRoZSBwYXJlbnQgdGltZWxpbmUncyB3aGVuIGFwcHJvcHJpYXRlLlxuXHRcdFx0aWYgKHRoaXMuX2djIHx8IHRoaXMuX3RpbWUgPT09IHRoaXMuX2R1cmF0aW9uKSBpZiAoIXRoaXMuX3BhdXNlZCkgaWYgKHRoaXMuX2R1cmF0aW9uIDwgdGhpcy5kdXJhdGlvbigpKSB7XG5cdFx0XHRcdC8vaW4gY2FzZSBhbnkgb2YgdGhlIGFuY2VzdG9ycyBoYWQgY29tcGxldGVkIGJ1dCBzaG91bGQgbm93IGJlIGVuYWJsZWQuLi5cblx0XHRcdFx0dGwgPSB0aGlzO1xuXHRcdFx0XHRiZWZvcmVSYXdUaW1lID0gKHRsLnJhd1RpbWUoKSA+IHZhbHVlLl9zdGFydFRpbWUpOyAvL2lmIHRoZSB0d2VlbiBpcyBwbGFjZWQgb24gdGhlIHRpbWVsaW5lIHNvIHRoYXQgaXQgc3RhcnRzIEJFRk9SRSB0aGUgY3VycmVudCByYXdUaW1lLCB3ZSBzaG91bGQgYWxpZ24gdGhlIHBsYXloZWFkIChtb3ZlIHRoZSB0aW1lbGluZSkuIFRoaXMgaXMgYmVjYXVzZSBzb21ldGltZXMgdXNlcnMgd2lsbCBjcmVhdGUgYSB0aW1lbGluZSwgbGV0IGl0IGZpbmlzaCwgYW5kIG11Y2ggbGF0ZXIgYXBwZW5kIGEgdHdlZW4gYW5kIGV4cGVjdCBpdCB0byBydW4gaW5zdGVhZCBvZiBqdW1waW5nIHRvIGl0cyBlbmQgc3RhdGUuIFdoaWxlIHRlY2huaWNhbGx5IG9uZSBjb3VsZCBhcmd1ZSB0aGF0IGl0IHNob3VsZCBqdW1wIHRvIGl0cyBlbmQgc3RhdGUsIHRoYXQncyBub3Qgd2hhdCB1c2VycyBpbnR1aXRpdmVseSBleHBlY3QuXG5cdFx0XHRcdHdoaWxlICh0bC5fdGltZWxpbmUpIHtcblx0XHRcdFx0XHRpZiAoYmVmb3JlUmF3VGltZSAmJiB0bC5fdGltZWxpbmUuc21vb3RoQ2hpbGRUaW1pbmcpIHtcblx0XHRcdFx0XHRcdHRsLnRvdGFsVGltZSh0bC5fdG90YWxUaW1lLCB0cnVlKTsgLy9tb3ZlcyB0aGUgdGltZWxpbmUgKHNoaWZ0cyBpdHMgc3RhcnRUaW1lKSBpZiBuZWNlc3NhcnksIGFuZCBhbHNvIGVuYWJsZXMgaXQuXG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0bC5fZ2MpIHtcblx0XHRcdFx0XHRcdHRsLl9lbmFibGVkKHRydWUsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGwgPSB0bC5fdGltZWxpbmU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblxuXHRcdHAucmVtb3ZlID0gZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFuaW1hdGlvbikge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmUodmFsdWUsIGZhbHNlKTtcblx0XHRcdFx0dmFyIHRsID0gdmFsdWUuX3RpbWVsaW5lID0gdmFsdWUudmFycy51c2VGcmFtZXMgPyBBbmltYXRpb24uX3Jvb3RGcmFtZXNUaW1lbGluZSA6IEFuaW1hdGlvbi5fcm9vdFRpbWVsaW5lOyAvL25vdyB0aGF0IGl0J3MgcmVtb3ZlZCwgZGVmYXVsdCBpdCB0byB0aGUgcm9vdCB0aW1lbGluZSBzbyB0aGF0IGlmIGl0IGdldHMgcGxheWVkIGFnYWluLCBpdCBkb2Vzbid0IGp1bXAgYmFjayBpbnRvIHRoaXMgdGltZWxpbmUuXG5cdFx0XHRcdHZhbHVlLl9zdGFydFRpbWUgPSAodmFsdWUuX3BhdXNlZCA/IHZhbHVlLl9wYXVzZVRpbWUgOiB0bC5fdGltZSkgLSAoKCF2YWx1ZS5fcmV2ZXJzZWQgPyB2YWx1ZS5fdG90YWxUaW1lIDogdmFsdWUudG90YWxEdXJhdGlvbigpIC0gdmFsdWUuX3RvdGFsVGltZSkgLyB2YWx1ZS5fdGltZVNjYWxlKTsgLy9lbnN1cmUgdGhhdCBpZiBpdCBnZXRzIHBsYXllZCBhZ2FpbiwgdGhlIHRpbWluZyBpcyBjb3JyZWN0LlxuXHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBBcnJheSB8fCAodmFsdWUgJiYgdmFsdWUucHVzaCAmJiBfaXNBcnJheSh2YWx1ZSkpKSB7XG5cdFx0XHRcdHZhciBpID0gdmFsdWUubGVuZ3RoO1xuXHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZSh2YWx1ZVtpXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZih2YWx1ZSkgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVtb3ZlTGFiZWwodmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMua2lsbChudWxsLCB2YWx1ZSk7XG5cdFx0fTtcblxuXHRcdHAuX3JlbW92ZSA9IGZ1bmN0aW9uKHR3ZWVuLCBza2lwRGlzYWJsZSkge1xuXHRcdFx0U2ltcGxlVGltZWxpbmUucHJvdG90eXBlLl9yZW1vdmUuY2FsbCh0aGlzLCB0d2Vlbiwgc2tpcERpc2FibGUpO1xuXHRcdFx0dmFyIGxhc3QgPSB0aGlzLl9sYXN0O1xuXHRcdFx0aWYgKCFsYXN0KSB7XG5cdFx0XHRcdHRoaXMuX3RpbWUgPSB0aGlzLl90b3RhbFRpbWUgPSB0aGlzLl9kdXJhdGlvbiA9IHRoaXMuX3RvdGFsRHVyYXRpb24gPSAwO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl90aW1lID4gbGFzdC5fc3RhcnRUaW1lICsgbGFzdC5fdG90YWxEdXJhdGlvbiAvIGxhc3QuX3RpbWVTY2FsZSkge1xuXHRcdFx0XHR0aGlzLl90aW1lID0gdGhpcy5kdXJhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl90b3RhbFRpbWUgPSB0aGlzLl90b3RhbER1cmF0aW9uO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblxuXHRcdHAuYXBwZW5kID0gZnVuY3Rpb24odmFsdWUsIG9mZnNldE9yTGFiZWwpIHtcblx0XHRcdHJldHVybiB0aGlzLmFkZCh2YWx1ZSwgdGhpcy5fcGFyc2VUaW1lT3JMYWJlbChudWxsLCBvZmZzZXRPckxhYmVsLCB0cnVlLCB2YWx1ZSkpO1xuXHRcdH07XG5cblx0XHRwLmluc2VydCA9IHAuaW5zZXJ0TXVsdGlwbGUgPSBmdW5jdGlvbih2YWx1ZSwgcG9zaXRpb24sIGFsaWduLCBzdGFnZ2VyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hZGQodmFsdWUsIHBvc2l0aW9uIHx8IDAsIGFsaWduLCBzdGFnZ2VyKTtcblx0XHR9O1xuXG5cdFx0cC5hcHBlbmRNdWx0aXBsZSA9IGZ1bmN0aW9uKHR3ZWVucywgb2Zmc2V0T3JMYWJlbCwgYWxpZ24sIHN0YWdnZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmFkZCh0d2VlbnMsIHRoaXMuX3BhcnNlVGltZU9yTGFiZWwobnVsbCwgb2Zmc2V0T3JMYWJlbCwgdHJ1ZSwgdHdlZW5zKSwgYWxpZ24sIHN0YWdnZXIpO1xuXHRcdH07XG5cblx0XHRwLmFkZExhYmVsID0gZnVuY3Rpb24obGFiZWwsIHBvc2l0aW9uKSB7XG5cdFx0XHR0aGlzLl9sYWJlbHNbbGFiZWxdID0gdGhpcy5fcGFyc2VUaW1lT3JMYWJlbChwb3NpdGlvbik7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXG5cdFx0cC5hZGRQYXVzZSA9IGZ1bmN0aW9uKHBvc2l0aW9uLCBjYWxsYmFjaywgcGFyYW1zLCBzY29wZSkge1xuXHRcdFx0dmFyIHQgPSBUd2VlbkxpdGUuZGVsYXllZENhbGwoMCwgX3BhdXNlQ2FsbGJhY2ssIHBhcmFtcywgc2NvcGUgfHwgdGhpcyk7XG5cdFx0XHR0LnZhcnMub25Db21wbGV0ZSA9IHQudmFycy5vblJldmVyc2VDb21wbGV0ZSA9IGNhbGxiYWNrO1xuXHRcdFx0dC5kYXRhID0gXCJpc1BhdXNlXCI7XG5cdFx0XHR0aGlzLl9oYXNQYXVzZSA9IHRydWU7XG5cdFx0XHRyZXR1cm4gdGhpcy5hZGQodCwgcG9zaXRpb24pO1xuXHRcdH07XG5cblx0XHRwLnJlbW92ZUxhYmVsID0gZnVuY3Rpb24obGFiZWwpIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9sYWJlbHNbbGFiZWxdO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblxuXHRcdHAuZ2V0TGFiZWxUaW1lID0gZnVuY3Rpb24obGFiZWwpIHtcblx0XHRcdHJldHVybiAodGhpcy5fbGFiZWxzW2xhYmVsXSAhPSBudWxsKSA/IHRoaXMuX2xhYmVsc1tsYWJlbF0gOiAtMTtcblx0XHR9O1xuXG5cdFx0cC5fcGFyc2VUaW1lT3JMYWJlbCA9IGZ1bmN0aW9uKHRpbWVPckxhYmVsLCBvZmZzZXRPckxhYmVsLCBhcHBlbmRJZkFic2VudCwgaWdub3JlKSB7XG5cdFx0XHR2YXIgaTtcblx0XHRcdC8vaWYgd2UncmUgYWJvdXQgdG8gYWRkIGEgdHdlZW4vdGltZWxpbmUgKG9yIGFuIGFycmF5IG9mIHRoZW0pIHRoYXQncyBhbHJlYWR5IGEgY2hpbGQgb2YgdGhpcyB0aW1lbGluZSwgd2Ugc2hvdWxkIHJlbW92ZSBpdCBmaXJzdCBzbyB0aGF0IGl0IGRvZXNuJ3QgY29udGFtaW5hdGUgdGhlIGR1cmF0aW9uKCkuXG5cdFx0XHRpZiAoaWdub3JlIGluc3RhbmNlb2YgQW5pbWF0aW9uICYmIGlnbm9yZS50aW1lbGluZSA9PT0gdGhpcykge1xuXHRcdFx0XHR0aGlzLnJlbW92ZShpZ25vcmUpO1xuXHRcdFx0fSBlbHNlIGlmIChpZ25vcmUgJiYgKChpZ25vcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgKGlnbm9yZS5wdXNoICYmIF9pc0FycmF5KGlnbm9yZSkpKSkge1xuXHRcdFx0XHRpID0gaWdub3JlLmxlbmd0aDtcblx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0aWYgKGlnbm9yZVtpXSBpbnN0YW5jZW9mIEFuaW1hdGlvbiAmJiBpZ25vcmVbaV0udGltZWxpbmUgPT09IHRoaXMpIHtcblx0XHRcdFx0XHRcdHRoaXMucmVtb3ZlKGlnbm9yZVtpXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mKG9mZnNldE9yTGFiZWwpID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wYXJzZVRpbWVPckxhYmVsKG9mZnNldE9yTGFiZWwsIChhcHBlbmRJZkFic2VudCAmJiB0eXBlb2YodGltZU9yTGFiZWwpID09PSBcIm51bWJlclwiICYmIHRoaXMuX2xhYmVsc1tvZmZzZXRPckxhYmVsXSA9PSBudWxsKSA/IHRpbWVPckxhYmVsIC0gdGhpcy5kdXJhdGlvbigpIDogMCwgYXBwZW5kSWZBYnNlbnQpO1xuXHRcdFx0fVxuXHRcdFx0b2Zmc2V0T3JMYWJlbCA9IG9mZnNldE9yTGFiZWwgfHwgMDtcblx0XHRcdGlmICh0eXBlb2YodGltZU9yTGFiZWwpID09PSBcInN0cmluZ1wiICYmIChpc05hTih0aW1lT3JMYWJlbCkgfHwgdGhpcy5fbGFiZWxzW3RpbWVPckxhYmVsXSAhPSBudWxsKSkgeyAvL2lmIHRoZSBzdHJpbmcgaXMgYSBudW1iZXIgbGlrZSBcIjFcIiwgY2hlY2sgdG8gc2VlIGlmIHRoZXJlJ3MgYSBsYWJlbCB3aXRoIHRoYXQgbmFtZSwgb3RoZXJ3aXNlIGludGVycHJldCBpdCBhcyBhIG51bWJlciAoYWJzb2x1dGUgdmFsdWUpLlxuXHRcdFx0XHRpID0gdGltZU9yTGFiZWwuaW5kZXhPZihcIj1cIik7XG5cdFx0XHRcdGlmIChpID09PSAtMSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9sYWJlbHNbdGltZU9yTGFiZWxdID09IG51bGwpIHtcblx0XHRcdFx0XHRcdHJldHVybiBhcHBlbmRJZkFic2VudCA/ICh0aGlzLl9sYWJlbHNbdGltZU9yTGFiZWxdID0gdGhpcy5kdXJhdGlvbigpICsgb2Zmc2V0T3JMYWJlbCkgOiBvZmZzZXRPckxhYmVsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fbGFiZWxzW3RpbWVPckxhYmVsXSArIG9mZnNldE9yTGFiZWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0b2Zmc2V0T3JMYWJlbCA9IHBhcnNlSW50KHRpbWVPckxhYmVsLmNoYXJBdChpLTEpICsgXCIxXCIsIDEwKSAqIE51bWJlcih0aW1lT3JMYWJlbC5zdWJzdHIoaSsxKSk7XG5cdFx0XHRcdHRpbWVPckxhYmVsID0gKGkgPiAxKSA/IHRoaXMuX3BhcnNlVGltZU9yTGFiZWwodGltZU9yTGFiZWwuc3Vic3RyKDAsIGktMSksIDAsIGFwcGVuZElmQWJzZW50KSA6IHRoaXMuZHVyYXRpb24oKTtcblx0XHRcdH0gZWxzZSBpZiAodGltZU9yTGFiZWwgPT0gbnVsbCkge1xuXHRcdFx0XHR0aW1lT3JMYWJlbCA9IHRoaXMuZHVyYXRpb24oKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBOdW1iZXIodGltZU9yTGFiZWwpICsgb2Zmc2V0T3JMYWJlbDtcblx0XHR9O1xuXG5cdFx0cC5zZWVrID0gZnVuY3Rpb24ocG9zaXRpb24sIHN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50b3RhbFRpbWUoKHR5cGVvZihwb3NpdGlvbikgPT09IFwibnVtYmVyXCIpID8gcG9zaXRpb24gOiB0aGlzLl9wYXJzZVRpbWVPckxhYmVsKHBvc2l0aW9uKSwgKHN1cHByZXNzRXZlbnRzICE9PSBmYWxzZSkpO1xuXHRcdH07XG5cblx0XHRwLnN0b3AgPSBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLnBhdXNlZCh0cnVlKTtcblx0XHR9O1xuXG5cdFx0cC5nb3RvQW5kUGxheSA9IGZ1bmN0aW9uKHBvc2l0aW9uLCBzdXBwcmVzc0V2ZW50cykge1xuXHRcdFx0cmV0dXJuIHRoaXMucGxheShwb3NpdGlvbiwgc3VwcHJlc3NFdmVudHMpO1xuXHRcdH07XG5cblx0XHRwLmdvdG9BbmRTdG9wID0gZnVuY3Rpb24ocG9zaXRpb24sIHN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXVzZShwb3NpdGlvbiwgc3VwcHJlc3NFdmVudHMpO1xuXHRcdH07XG5cblx0XHRwLnJlbmRlciA9IGZ1bmN0aW9uKHRpbWUsIHN1cHByZXNzRXZlbnRzLCBmb3JjZSkge1xuXHRcdFx0aWYgKHRoaXMuX2djKSB7XG5cdFx0XHRcdHRoaXMuX2VuYWJsZWQodHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0dmFyIHRvdGFsRHVyID0gKCF0aGlzLl9kaXJ0eSkgPyB0aGlzLl90b3RhbER1cmF0aW9uIDogdGhpcy50b3RhbER1cmF0aW9uKCksXG5cdFx0XHRcdHByZXZUaW1lID0gdGhpcy5fdGltZSxcblx0XHRcdFx0cHJldlN0YXJ0ID0gdGhpcy5fc3RhcnRUaW1lLFxuXHRcdFx0XHRwcmV2VGltZVNjYWxlID0gdGhpcy5fdGltZVNjYWxlLFxuXHRcdFx0XHRwcmV2UGF1c2VkID0gdGhpcy5fcGF1c2VkLFxuXHRcdFx0XHR0d2VlbiwgaXNDb21wbGV0ZSwgbmV4dCwgY2FsbGJhY2ssIGludGVybmFsRm9yY2UsIHBhdXNlVHdlZW47XG5cdFx0XHRpZiAodGltZSA+PSB0b3RhbER1cikge1xuXHRcdFx0XHR0aGlzLl90b3RhbFRpbWUgPSB0aGlzLl90aW1lID0gdG90YWxEdXI7XG5cdFx0XHRcdGlmICghdGhpcy5fcmV2ZXJzZWQpIGlmICghdGhpcy5faGFzUGF1c2VkQ2hpbGQoKSkge1xuXHRcdFx0XHRcdGlzQ29tcGxldGUgPSB0cnVlO1xuXHRcdFx0XHRcdGNhbGxiYWNrID0gXCJvbkNvbXBsZXRlXCI7XG5cdFx0XHRcdFx0aW50ZXJuYWxGb3JjZSA9ICEhdGhpcy5fdGltZWxpbmUuYXV0b1JlbW92ZUNoaWxkcmVuOyAvL290aGVyd2lzZSwgaWYgdGhlIGFuaW1hdGlvbiBpcyB1bnBhdXNlZC9hY3RpdmF0ZWQgYWZ0ZXIgaXQncyBhbHJlYWR5IGZpbmlzaGVkLCBpdCBkb2Vzbid0IGdldCByZW1vdmVkIGZyb20gdGhlIHBhcmVudCB0aW1lbGluZS5cblx0XHRcdFx0XHRpZiAodGhpcy5fZHVyYXRpb24gPT09IDApIGlmICh0aW1lID09PSAwIHx8IHRoaXMuX3Jhd1ByZXZUaW1lIDwgMCB8fCB0aGlzLl9yYXdQcmV2VGltZSA9PT0gX3RpbnlOdW0pIGlmICh0aGlzLl9yYXdQcmV2VGltZSAhPT0gdGltZSAmJiB0aGlzLl9maXJzdCkge1xuXHRcdFx0XHRcdFx0aW50ZXJuYWxGb3JjZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fcmF3UHJldlRpbWUgPiBfdGlueU51bSkge1xuXHRcdFx0XHRcdFx0XHRjYWxsYmFjayA9IFwib25SZXZlcnNlQ29tcGxldGVcIjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmF3UHJldlRpbWUgPSAodGhpcy5fZHVyYXRpb24gfHwgIXN1cHByZXNzRXZlbnRzIHx8IHRpbWUgfHwgdGhpcy5fcmF3UHJldlRpbWUgPT09IHRpbWUpID8gdGltZSA6IF90aW55TnVtOyAvL3doZW4gdGhlIHBsYXloZWFkIGFycml2ZXMgYXQgRVhBQ1RMWSB0aW1lIDAgKHJpZ2h0IG9uIHRvcCkgb2YgYSB6ZXJvLWR1cmF0aW9uIHRpbWVsaW5lIG9yIHR3ZWVuLCB3ZSBuZWVkIHRvIGRpc2Nlcm4gaWYgZXZlbnRzIGFyZSBzdXBwcmVzc2VkIHNvIHRoYXQgd2hlbiB0aGUgcGxheWhlYWQgbW92ZXMgYWdhaW4gKG5leHQgdGltZSksIGl0J2xsIHRyaWdnZXIgdGhlIGNhbGxiYWNrLiBJZiBldmVudHMgYXJlIE5PVCBzdXBwcmVzc2VkLCBvYnZpb3VzbHkgdGhlIGNhbGxiYWNrIHdvdWxkIGJlIHRyaWdnZXJlZCBpbiB0aGlzIHJlbmRlci4gQmFzaWNhbGx5LCB0aGUgY2FsbGJhY2sgc2hvdWxkIGZpcmUgZWl0aGVyIHdoZW4gdGhlIHBsYXloZWFkIEFSUklWRVMgb3IgTEVBVkVTIHRoaXMgZXhhY3Qgc3BvdCwgbm90IGJvdGguIEltYWdpbmUgZG9pbmcgYSB0aW1lbGluZS5zZWVrKDApIGFuZCB0aGVyZSdzIGEgY2FsbGJhY2sgdGhhdCBzaXRzIGF0IDAuIFNpbmNlIGV2ZW50cyBhcmUgc3VwcHJlc3NlZCBvbiB0aGF0IHNlZWsoKSBieSBkZWZhdWx0LCBub3RoaW5nIHdpbGwgZmlyZSwgYnV0IHdoZW4gdGhlIHBsYXloZWFkIG1vdmVzIG9mZiBvZiB0aGF0IHBvc2l0aW9uLCB0aGUgY2FsbGJhY2sgc2hvdWxkIGZpcmUuIFRoaXMgYmVoYXZpb3IgaXMgd2hhdCBwZW9wbGUgaW50dWl0aXZlbHkgZXhwZWN0LiBXZSBzZXQgdGhlIF9yYXdQcmV2VGltZSB0byBiZSBhIHByZWNpc2UgdGlueSBudW1iZXIgdG8gaW5kaWNhdGUgdGhpcyBzY2VuYXJpbyByYXRoZXIgdGhhbiB1c2luZyBhbm90aGVyIHByb3BlcnR5L3ZhcmlhYmxlIHdoaWNoIHdvdWxkIGluY3JlYXNlIG1lbW9yeSB1c2FnZS4gVGhpcyB0ZWNobmlxdWUgaXMgbGVzcyByZWFkYWJsZSwgYnV0IG1vcmUgZWZmaWNpZW50LlxuXHRcdFx0XHR0aW1lID0gdG90YWxEdXIgKyAwLjAwMDE7IC8vdG8gYXZvaWQgb2NjYXNpb25hbCBmbG9hdGluZyBwb2ludCByb3VuZGluZyBlcnJvcnMgLSBzb21ldGltZXMgY2hpbGQgdHdlZW5zL3RpbWVsaW5lcyB3ZXJlIG5vdCBiZWluZyBmdWxseSBjb21wbGV0ZWQgKHRoZWlyIHByb2dyZXNzIG1pZ2h0IGJlIDAuOTk5OTk5OTk5OTk5OTk4IGluc3RlYWQgb2YgMSBiZWNhdXNlIHdoZW4gX3RpbWUgLSB0d2Vlbi5fc3RhcnRUaW1lIGlzIHBlcmZvcm1lZCwgZmxvYXRpbmcgcG9pbnQgZXJyb3JzIHdvdWxkIHJldHVybiBhIHZhbHVlIHRoYXQgd2FzIFNMSUdIVExZIG9mZikuIFRyeSAoOTk5OTk5OTk5OTk5LjcgLSA5OTk5OTk5OTk5OTkpICogMSA9IDAuNjk5OTUxMTcxODc1IGluc3RlYWQgb2YgMC43LlxuXG5cdFx0XHR9IGVsc2UgaWYgKHRpbWUgPCAwLjAwMDAwMDEpIHsgLy90byB3b3JrIGFyb3VuZCBvY2Nhc2lvbmFsIGZsb2F0aW5nIHBvaW50IG1hdGggYXJ0aWZhY3RzLCByb3VuZCBzdXBlciBzbWFsbCB2YWx1ZXMgdG8gMC5cblx0XHRcdFx0dGhpcy5fdG90YWxUaW1lID0gdGhpcy5fdGltZSA9IDA7XG5cdFx0XHRcdGlmIChwcmV2VGltZSAhPT0gMCB8fCAodGhpcy5fZHVyYXRpb24gPT09IDAgJiYgdGhpcy5fcmF3UHJldlRpbWUgIT09IF90aW55TnVtICYmICh0aGlzLl9yYXdQcmV2VGltZSA+IDAgfHwgKHRpbWUgPCAwICYmIHRoaXMuX3Jhd1ByZXZUaW1lID49IDApKSkpIHtcblx0XHRcdFx0XHRjYWxsYmFjayA9IFwib25SZXZlcnNlQ29tcGxldGVcIjtcblx0XHRcdFx0XHRpc0NvbXBsZXRlID0gdGhpcy5fcmV2ZXJzZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRpbWUgPCAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlID0gZmFsc2U7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3RpbWVsaW5lLmF1dG9SZW1vdmVDaGlsZHJlbiAmJiB0aGlzLl9yZXZlcnNlZCkgeyAvL2Vuc3VyZXMgcHJvcGVyIEdDIGlmIGEgdGltZWxpbmUgaXMgcmVzdW1lZCBhZnRlciBpdCdzIGZpbmlzaGVkIHJldmVyc2luZy5cblx0XHRcdFx0XHRcdGludGVybmFsRm9yY2UgPSBpc0NvbXBsZXRlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNhbGxiYWNrID0gXCJvblJldmVyc2VDb21wbGV0ZVwiO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fcmF3UHJldlRpbWUgPj0gMCAmJiB0aGlzLl9maXJzdCkgeyAvL3doZW4gZ29pbmcgYmFjayBiZXlvbmQgdGhlIHN0YXJ0LCBmb3JjZSBhIHJlbmRlciBzbyB0aGF0IHplcm8tZHVyYXRpb24gdHdlZW5zIHRoYXQgc2l0IGF0IHRoZSB2ZXJ5IGJlZ2lubmluZyByZW5kZXIgdGhlaXIgc3RhcnQgdmFsdWVzIHByb3Blcmx5LiBPdGhlcndpc2UsIGlmIHRoZSBwYXJlbnQgdGltZWxpbmUncyBwbGF5aGVhZCBsYW5kcyBleGFjdGx5IGF0IHRoaXMgdGltZWxpbmUncyBzdGFydFRpbWUsIGFuZCB0aGVuIG1vdmVzIGJhY2t3YXJkcywgdGhlIHplcm8tZHVyYXRpb24gdHdlZW5zIGF0IHRoZSBiZWdpbm5pbmcgd291bGQgc3RpbGwgYmUgYXQgdGhlaXIgZW5kIHN0YXRlLlxuXHRcdFx0XHRcdFx0aW50ZXJuYWxGb3JjZSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3Jhd1ByZXZUaW1lID0gdGltZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9yYXdQcmV2VGltZSA9ICh0aGlzLl9kdXJhdGlvbiB8fCAhc3VwcHJlc3NFdmVudHMgfHwgdGltZSB8fCB0aGlzLl9yYXdQcmV2VGltZSA9PT0gdGltZSkgPyB0aW1lIDogX3RpbnlOdW07IC8vd2hlbiB0aGUgcGxheWhlYWQgYXJyaXZlcyBhdCBFWEFDVExZIHRpbWUgMCAocmlnaHQgb24gdG9wKSBvZiBhIHplcm8tZHVyYXRpb24gdGltZWxpbmUgb3IgdHdlZW4sIHdlIG5lZWQgdG8gZGlzY2VybiBpZiBldmVudHMgYXJlIHN1cHByZXNzZWQgc28gdGhhdCB3aGVuIHRoZSBwbGF5aGVhZCBtb3ZlcyBhZ2FpbiAobmV4dCB0aW1lKSwgaXQnbGwgdHJpZ2dlciB0aGUgY2FsbGJhY2suIElmIGV2ZW50cyBhcmUgTk9UIHN1cHByZXNzZWQsIG9idmlvdXNseSB0aGUgY2FsbGJhY2sgd291bGQgYmUgdHJpZ2dlcmVkIGluIHRoaXMgcmVuZGVyLiBCYXNpY2FsbHksIHRoZSBjYWxsYmFjayBzaG91bGQgZmlyZSBlaXRoZXIgd2hlbiB0aGUgcGxheWhlYWQgQVJSSVZFUyBvciBMRUFWRVMgdGhpcyBleGFjdCBzcG90LCBub3QgYm90aC4gSW1hZ2luZSBkb2luZyBhIHRpbWVsaW5lLnNlZWsoMCkgYW5kIHRoZXJlJ3MgYSBjYWxsYmFjayB0aGF0IHNpdHMgYXQgMC4gU2luY2UgZXZlbnRzIGFyZSBzdXBwcmVzc2VkIG9uIHRoYXQgc2VlaygpIGJ5IGRlZmF1bHQsIG5vdGhpbmcgd2lsbCBmaXJlLCBidXQgd2hlbiB0aGUgcGxheWhlYWQgbW92ZXMgb2ZmIG9mIHRoYXQgcG9zaXRpb24sIHRoZSBjYWxsYmFjayBzaG91bGQgZmlyZS4gVGhpcyBiZWhhdmlvciBpcyB3aGF0IHBlb3BsZSBpbnR1aXRpdmVseSBleHBlY3QuIFdlIHNldCB0aGUgX3Jhd1ByZXZUaW1lIHRvIGJlIGEgcHJlY2lzZSB0aW55IG51bWJlciB0byBpbmRpY2F0ZSB0aGlzIHNjZW5hcmlvIHJhdGhlciB0aGFuIHVzaW5nIGFub3RoZXIgcHJvcGVydHkvdmFyaWFibGUgd2hpY2ggd291bGQgaW5jcmVhc2UgbWVtb3J5IHVzYWdlLiBUaGlzIHRlY2huaXF1ZSBpcyBsZXNzIHJlYWRhYmxlLCBidXQgbW9yZSBlZmZpY2llbnQuXG5cdFx0XHRcdFx0aWYgKHRpbWUgPT09IDAgJiYgaXNDb21wbGV0ZSkgeyAvL2lmIHRoZXJlJ3MgYSB6ZXJvLWR1cmF0aW9uIHR3ZWVuIGF0IHRoZSB2ZXJ5IGJlZ2lubmluZyBvZiBhIHRpbWVsaW5lIGFuZCB0aGUgcGxheWhlYWQgbGFuZHMgRVhBQ1RMWSBhdCB0aW1lIDAsIHRoYXQgdHdlZW4gd2lsbCBjb3JyZWN0bHkgcmVuZGVyIGl0cyBlbmQgdmFsdWVzLCBidXQgd2UgbmVlZCB0byBrZWVwIHRoZSB0aW1lbGluZSBhbGl2ZSBmb3Igb25lIG1vcmUgcmVuZGVyIHNvIHRoYXQgdGhlIGJlZ2lubmluZyB2YWx1ZXMgcmVuZGVyIHByb3Blcmx5IGFzIHRoZSBwYXJlbnQncyBwbGF5aGVhZCBrZWVwcyBtb3ZpbmcgYmV5b25kIHRoZSBiZWdpbmluZy4gSW1hZ2luZSBvYmoueCBzdGFydHMgYXQgMCBhbmQgdGhlbiB3ZSBkbyB0bC5zZXQob2JqLCB7eDoxMDB9KS50byhvYmosIDEsIHt4OjIwMH0pIGFuZCB0aGVuIGxhdGVyIHdlIHRsLnJldmVyc2UoKS4uLnRoZSBnb2FsIGlzIHRvIGhhdmUgb2JqLnggcmV2ZXJ0IHRvIDAuIElmIHRoZSBwbGF5aGVhZCBoYXBwZW5zIHRvIGxhbmQgb24gZXhhY3RseSAwLCB3aXRob3V0IHRoaXMgY2h1bmsgb2YgY29kZSwgaXQnZCBjb21wbGV0ZSB0aGUgdGltZWxpbmUgYW5kIHJlbW92ZSBpdCBmcm9tIHRoZSByZW5kZXJpbmcgcXVldWUgKG5vdCBnb29kKS5cblx0XHRcdFx0XHRcdHR3ZWVuID0gdGhpcy5fZmlyc3Q7XG5cdFx0XHRcdFx0XHR3aGlsZSAodHdlZW4gJiYgdHdlZW4uX3N0YXJ0VGltZSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXR3ZWVuLl9kdXJhdGlvbikge1xuXHRcdFx0XHRcdFx0XHRcdGlzQ29tcGxldGUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0d2VlbiA9IHR3ZWVuLl9uZXh0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aW1lID0gMDsgLy90byBhdm9pZCBvY2Nhc2lvbmFsIGZsb2F0aW5nIHBvaW50IHJvdW5kaW5nIGVycm9ycyAoY291bGQgY2F1c2UgcHJvYmxlbXMgZXNwZWNpYWxseSB3aXRoIHplcm8tZHVyYXRpb24gdHdlZW5zIGF0IHRoZSB2ZXJ5IGJlZ2lubmluZyBvZiB0aGUgdGltZWxpbmUpXG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9pbml0dGVkKSB7XG5cdFx0XHRcdFx0XHRpbnRlcm5hbEZvcmNlID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIHtcblxuXHRcdFx0XHRpZiAodGhpcy5faGFzUGF1c2UgJiYgIXRoaXMuX2ZvcmNpbmdQbGF5aGVhZCAmJiAhc3VwcHJlc3NFdmVudHMpIHtcblx0XHRcdFx0XHRpZiAodGltZSA+PSBwcmV2VGltZSkge1xuXHRcdFx0XHRcdFx0dHdlZW4gPSB0aGlzLl9maXJzdDtcblx0XHRcdFx0XHRcdHdoaWxlICh0d2VlbiAmJiB0d2Vlbi5fc3RhcnRUaW1lIDw9IHRpbWUgJiYgIXBhdXNlVHdlZW4pIHtcblx0XHRcdFx0XHRcdFx0aWYgKCF0d2Vlbi5fZHVyYXRpb24pIGlmICh0d2Vlbi5kYXRhID09PSBcImlzUGF1c2VcIiAmJiAhdHdlZW4ucmF0aW8gJiYgISh0d2Vlbi5fc3RhcnRUaW1lID09PSAwICYmIHRoaXMuX3Jhd1ByZXZUaW1lID09PSAwKSkge1xuXHRcdFx0XHRcdFx0XHRcdHBhdXNlVHdlZW4gPSB0d2Vlbjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0d2VlbiA9IHR3ZWVuLl9uZXh0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0d2VlbiA9IHRoaXMuX2xhc3Q7XG5cdFx0XHRcdFx0XHR3aGlsZSAodHdlZW4gJiYgdHdlZW4uX3N0YXJ0VGltZSA+PSB0aW1lICYmICFwYXVzZVR3ZWVuKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghdHdlZW4uX2R1cmF0aW9uKSBpZiAodHdlZW4uZGF0YSA9PT0gXCJpc1BhdXNlXCIgJiYgdHdlZW4uX3Jhd1ByZXZUaW1lID4gMCkge1xuXHRcdFx0XHRcdFx0XHRcdHBhdXNlVHdlZW4gPSB0d2Vlbjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0d2VlbiA9IHR3ZWVuLl9wcmV2O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocGF1c2VUd2Vlbikge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGltZSA9IHRpbWUgPSBwYXVzZVR3ZWVuLl9zdGFydFRpbWU7XG5cdFx0XHRcdFx0XHR0aGlzLl90b3RhbFRpbWUgPSB0aW1lICsgKHRoaXMuX2N5Y2xlICogKHRoaXMuX3RvdGFsRHVyYXRpb24gKyB0aGlzLl9yZXBlYXREZWxheSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3RvdGFsVGltZSA9IHRoaXMuX3RpbWUgPSB0aGlzLl9yYXdQcmV2VGltZSA9IHRpbWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKHRoaXMuX3RpbWUgPT09IHByZXZUaW1lIHx8ICF0aGlzLl9maXJzdCkgJiYgIWZvcmNlICYmICFpbnRlcm5hbEZvcmNlICYmICFwYXVzZVR3ZWVuKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuX2luaXR0ZWQpIHtcblx0XHRcdFx0dGhpcy5faW5pdHRlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fYWN0aXZlKSBpZiAoIXRoaXMuX3BhdXNlZCAmJiB0aGlzLl90aW1lICE9PSBwcmV2VGltZSAmJiB0aW1lID4gMCkge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmUgPSB0cnVlOyAgLy9zbyB0aGF0IGlmIHRoZSB1c2VyIHJlbmRlcnMgdGhlIHRpbWVsaW5lIChhcyBvcHBvc2VkIHRvIHRoZSBwYXJlbnQgdGltZWxpbmUgcmVuZGVyaW5nIGl0KSwgaXQgaXMgZm9yY2VkIHRvIHJlLXJlbmRlciBhbmQgYWxpZ24gaXQgd2l0aCB0aGUgcHJvcGVyIHRpbWUvZnJhbWUgb24gdGhlIG5leHQgcmVuZGVyaW5nIGN5Y2xlLiBNYXliZSB0aGUgdGltZWxpbmUgYWxyZWFkeSBmaW5pc2hlZCBidXQgdGhlIHVzZXIgbWFudWFsbHkgcmUtcmVuZGVycyBpdCBhcyBoYWxmd2F5IGRvbmUsIGZvciBleGFtcGxlLlxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJldlRpbWUgPT09IDApIGlmICh0aGlzLnZhcnMub25TdGFydCkgaWYgKHRoaXMuX3RpbWUgIT09IDApIGlmICghc3VwcHJlc3NFdmVudHMpIHtcblx0XHRcdFx0dGhpcy5fY2FsbGJhY2soXCJvblN0YXJ0XCIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fdGltZSA+PSBwcmV2VGltZSkge1xuXHRcdFx0XHR0d2VlbiA9IHRoaXMuX2ZpcnN0O1xuXHRcdFx0XHR3aGlsZSAodHdlZW4pIHtcblx0XHRcdFx0XHRuZXh0ID0gdHdlZW4uX25leHQ7IC8vcmVjb3JkIGl0IGhlcmUgYmVjYXVzZSB0aGUgdmFsdWUgY291bGQgY2hhbmdlIGFmdGVyIHJlbmRlcmluZy4uLlxuXHRcdFx0XHRcdGlmICh0aGlzLl9wYXVzZWQgJiYgIXByZXZQYXVzZWQpIHsgLy9pbiBjYXNlIGEgdHdlZW4gcGF1c2VzIHRoZSB0aW1lbGluZSB3aGVuIHJlbmRlcmluZ1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0d2Vlbi5fYWN0aXZlIHx8ICh0d2Vlbi5fc3RhcnRUaW1lIDw9IHRoaXMuX3RpbWUgJiYgIXR3ZWVuLl9wYXVzZWQgJiYgIXR3ZWVuLl9nYykpIHtcblx0XHRcdFx0XHRcdGlmIChwYXVzZVR3ZWVuID09PSB0d2Vlbikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnBhdXNlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIXR3ZWVuLl9yZXZlcnNlZCkge1xuXHRcdFx0XHRcdFx0XHR0d2Vlbi5yZW5kZXIoKHRpbWUgLSB0d2Vlbi5fc3RhcnRUaW1lKSAqIHR3ZWVuLl90aW1lU2NhbGUsIHN1cHByZXNzRXZlbnRzLCBmb3JjZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0d2Vlbi5yZW5kZXIoKCghdHdlZW4uX2RpcnR5KSA/IHR3ZWVuLl90b3RhbER1cmF0aW9uIDogdHdlZW4udG90YWxEdXJhdGlvbigpKSAtICgodGltZSAtIHR3ZWVuLl9zdGFydFRpbWUpICogdHdlZW4uX3RpbWVTY2FsZSksIHN1cHByZXNzRXZlbnRzLCBmb3JjZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHR3ZWVuID0gbmV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHdlZW4gPSB0aGlzLl9sYXN0O1xuXHRcdFx0XHR3aGlsZSAodHdlZW4pIHtcblx0XHRcdFx0XHRuZXh0ID0gdHdlZW4uX3ByZXY7IC8vcmVjb3JkIGl0IGhlcmUgYmVjYXVzZSB0aGUgdmFsdWUgY291bGQgY2hhbmdlIGFmdGVyIHJlbmRlcmluZy4uLlxuXHRcdFx0XHRcdGlmICh0aGlzLl9wYXVzZWQgJiYgIXByZXZQYXVzZWQpIHsgLy9pbiBjYXNlIGEgdHdlZW4gcGF1c2VzIHRoZSB0aW1lbGluZSB3aGVuIHJlbmRlcmluZ1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0d2Vlbi5fYWN0aXZlIHx8ICh0d2Vlbi5fc3RhcnRUaW1lIDw9IHByZXZUaW1lICYmICF0d2Vlbi5fcGF1c2VkICYmICF0d2Vlbi5fZ2MpKSB7XG5cdFx0XHRcdFx0XHRpZiAocGF1c2VUd2VlbiA9PT0gdHdlZW4pIHtcblx0XHRcdFx0XHRcdFx0cGF1c2VUd2VlbiA9IHR3ZWVuLl9wcmV2OyAvL3RoZSBsaW5rZWQgbGlzdCBpcyBvcmdhbml6ZWQgYnkgX3N0YXJ0VGltZSwgdGh1cyBpdCdzIHBvc3NpYmxlIHRoYXQgYSB0d2VlbiBjb3VsZCBzdGFydCBCRUZPUkUgdGhlIHBhdXNlIGFuZCBlbmQgYWZ0ZXIgaXQsIGluIHdoaWNoIGNhc2UgaXQgd291bGQgYmUgcG9zaXRpb25lZCBiZWZvcmUgdGhlIHBhdXNlIHR3ZWVuIGluIHRoZSBsaW5rZWQgbGlzdCwgYnV0IHdlIHNob3VsZCByZW5kZXIgaXQgYmVmb3JlIHdlIHBhdXNlKCkgdGhlIHRpbWVsaW5lIGFuZCBjZWFzZSByZW5kZXJpbmcuIFRoaXMgaXMgb25seSBhIGNvbmNlcm4gd2hlbiBnb2luZyBpbiByZXZlcnNlLlxuXHRcdFx0XHRcdFx0XHR3aGlsZSAocGF1c2VUd2VlbiAmJiBwYXVzZVR3ZWVuLmVuZFRpbWUoKSA+IHRoaXMuX3RpbWUpIHtcblx0XHRcdFx0XHRcdFx0XHRwYXVzZVR3ZWVuLnJlbmRlciggKHBhdXNlVHdlZW4uX3JldmVyc2VkID8gcGF1c2VUd2Vlbi50b3RhbER1cmF0aW9uKCkgLSAoKHRpbWUgLSBwYXVzZVR3ZWVuLl9zdGFydFRpbWUpICogcGF1c2VUd2Vlbi5fdGltZVNjYWxlKSA6ICh0aW1lIC0gcGF1c2VUd2Vlbi5fc3RhcnRUaW1lKSAqIHBhdXNlVHdlZW4uX3RpbWVTY2FsZSksIHN1cHByZXNzRXZlbnRzLCBmb3JjZSk7XG5cdFx0XHRcdFx0XHRcdFx0cGF1c2VUd2VlbiA9IHBhdXNlVHdlZW4uX3ByZXY7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cGF1c2VUd2VlbiA9IG51bGw7XG5cdFx0XHRcdFx0XHRcdHRoaXMucGF1c2UoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICghdHdlZW4uX3JldmVyc2VkKSB7XG5cdFx0XHRcdFx0XHRcdHR3ZWVuLnJlbmRlcigodGltZSAtIHR3ZWVuLl9zdGFydFRpbWUpICogdHdlZW4uX3RpbWVTY2FsZSwgc3VwcHJlc3NFdmVudHMsIGZvcmNlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHR3ZWVuLnJlbmRlcigoKCF0d2Vlbi5fZGlydHkpID8gdHdlZW4uX3RvdGFsRHVyYXRpb24gOiB0d2Vlbi50b3RhbER1cmF0aW9uKCkpIC0gKCh0aW1lIC0gdHdlZW4uX3N0YXJ0VGltZSkgKiB0d2Vlbi5fdGltZVNjYWxlKSwgc3VwcHJlc3NFdmVudHMsIGZvcmNlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dHdlZW4gPSBuZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9vblVwZGF0ZSkgaWYgKCFzdXBwcmVzc0V2ZW50cykge1xuXHRcdFx0XHRpZiAoX2xhenlUd2VlbnMubGVuZ3RoKSB7IC8vaW4gY2FzZSByZW5kZXJpbmcgY2F1c2VkIGFueSB0d2VlbnMgdG8gbGF6eS1pbml0LCB3ZSBzaG91bGQgcmVuZGVyIHRoZW0gYmVjYXVzZSB0eXBpY2FsbHkgd2hlbiBhIHRpbWVsaW5lIGZpbmlzaGVzLCB1c2VycyBleHBlY3QgdGhpbmdzIHRvIGhhdmUgcmVuZGVyZWQgZnVsbHkuIEltYWdpbmUgYW4gb25VcGRhdGUgb24gYSB0aW1lbGluZSB0aGF0IHJlcG9ydHMvY2hlY2tzIHR3ZWVuZWQgdmFsdWVzLlxuXHRcdFx0XHRcdF9sYXp5UmVuZGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY2FsbGJhY2soXCJvblVwZGF0ZVwiKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNhbGxiYWNrKSBpZiAoIXRoaXMuX2djKSBpZiAocHJldlN0YXJ0ID09PSB0aGlzLl9zdGFydFRpbWUgfHwgcHJldlRpbWVTY2FsZSAhPT0gdGhpcy5fdGltZVNjYWxlKSBpZiAodGhpcy5fdGltZSA9PT0gMCB8fCB0b3RhbER1ciA+PSB0aGlzLnRvdGFsRHVyYXRpb24oKSkgeyAvL2lmIG9uZSBvZiB0aGUgdHdlZW5zIHRoYXQgd2FzIHJlbmRlcmVkIGFsdGVyZWQgdGhpcyB0aW1lbGluZSdzIHN0YXJ0VGltZSAobGlrZSBpZiBhbiBvbkNvbXBsZXRlIHJldmVyc2VkIHRoZSB0aW1lbGluZSksIGl0IHByb2JhYmx5IGlzbid0IGNvbXBsZXRlLiBJZiBpdCBpcywgZG9uJ3Qgd29ycnksIGJlY2F1c2Ugd2hhdGV2ZXIgY2FsbCBhbHRlcmVkIHRoZSBzdGFydFRpbWUgd291bGQgY29tcGxldGUgaWYgaXQgd2FzIG5lY2Vzc2FyeSBhdCB0aGUgbmV3IHRpbWUuIFRoZSBvbmx5IGV4Y2VwdGlvbiBpcyB0aGUgdGltZVNjYWxlIHByb3BlcnR5LiBBbHNvIGNoZWNrIF9nYyBiZWNhdXNlIHRoZXJlJ3MgYSBjaGFuY2UgdGhhdCBraWxsKCkgY291bGQgYmUgY2FsbGVkIGluIGFuIG9uVXBkYXRlXG5cdFx0XHRcdGlmIChpc0NvbXBsZXRlKSB7XG5cdFx0XHRcdFx0aWYgKF9sYXp5VHdlZW5zLmxlbmd0aCkgeyAvL2luIGNhc2UgcmVuZGVyaW5nIGNhdXNlZCBhbnkgdHdlZW5zIHRvIGxhenktaW5pdCwgd2Ugc2hvdWxkIHJlbmRlciB0aGVtIGJlY2F1c2UgdHlwaWNhbGx5IHdoZW4gYSB0aW1lbGluZSBmaW5pc2hlcywgdXNlcnMgZXhwZWN0IHRoaW5ncyB0byBoYXZlIHJlbmRlcmVkIGZ1bGx5LiBJbWFnaW5lIGFuIG9uQ29tcGxldGUgb24gYSB0aW1lbGluZSB0aGF0IHJlcG9ydHMvY2hlY2tzIHR3ZWVuZWQgdmFsdWVzLlxuXHRcdFx0XHRcdFx0X2xhenlSZW5kZXIoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3RpbWVsaW5lLmF1dG9SZW1vdmVDaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0dGhpcy5fZW5hYmxlZChmYWxzZSwgZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9hY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXN1cHByZXNzRXZlbnRzICYmIHRoaXMudmFyc1tjYWxsYmFja10pIHtcblx0XHRcdFx0XHR0aGlzLl9jYWxsYmFjayhjYWxsYmFjayk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cC5faGFzUGF1c2VkQ2hpbGQgPSBmdW5jdGlvbigpIHtcblx0XHRcdHZhciB0d2VlbiA9IHRoaXMuX2ZpcnN0O1xuXHRcdFx0d2hpbGUgKHR3ZWVuKSB7XG5cdFx0XHRcdGlmICh0d2Vlbi5fcGF1c2VkIHx8ICgodHdlZW4gaW5zdGFuY2VvZiBUaW1lbGluZUxpdGUpICYmIHR3ZWVuLl9oYXNQYXVzZWRDaGlsZCgpKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHR3ZWVuID0gdHdlZW4uX25leHQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblxuXHRcdHAuZ2V0Q2hpbGRyZW4gPSBmdW5jdGlvbihuZXN0ZWQsIHR3ZWVucywgdGltZWxpbmVzLCBpZ25vcmVCZWZvcmVUaW1lKSB7XG5cdFx0XHRpZ25vcmVCZWZvcmVUaW1lID0gaWdub3JlQmVmb3JlVGltZSB8fCAtOTk5OTk5OTk5OTtcblx0XHRcdHZhciBhID0gW10sXG5cdFx0XHRcdHR3ZWVuID0gdGhpcy5fZmlyc3QsXG5cdFx0XHRcdGNudCA9IDA7XG5cdFx0XHR3aGlsZSAodHdlZW4pIHtcblx0XHRcdFx0aWYgKHR3ZWVuLl9zdGFydFRpbWUgPCBpZ25vcmVCZWZvcmVUaW1lKSB7XG5cdFx0XHRcdFx0Ly9kbyBub3RoaW5nXG5cdFx0XHRcdH0gZWxzZSBpZiAodHdlZW4gaW5zdGFuY2VvZiBUd2VlbkxpdGUpIHtcblx0XHRcdFx0XHRpZiAodHdlZW5zICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0YVtjbnQrK10gPSB0d2Vlbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHRpbWVsaW5lcyAhPT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdGFbY250KytdID0gdHdlZW47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChuZXN0ZWQgIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRhID0gYS5jb25jYXQodHdlZW4uZ2V0Q2hpbGRyZW4odHJ1ZSwgdHdlZW5zLCB0aW1lbGluZXMpKTtcblx0XHRcdFx0XHRcdGNudCA9IGEubGVuZ3RoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0d2VlbiA9IHR3ZWVuLl9uZXh0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGE7XG5cdFx0fTtcblxuXHRcdHAuZ2V0VHdlZW5zT2YgPSBmdW5jdGlvbih0YXJnZXQsIG5lc3RlZCkge1xuXHRcdFx0dmFyIGRpc2FibGVkID0gdGhpcy5fZ2MsXG5cdFx0XHRcdGEgPSBbXSxcblx0XHRcdFx0Y250ID0gMCxcblx0XHRcdFx0dHdlZW5zLCBpO1xuXHRcdFx0aWYgKGRpc2FibGVkKSB7XG5cdFx0XHRcdHRoaXMuX2VuYWJsZWQodHJ1ZSwgdHJ1ZSk7IC8vZ2V0VHdlZW5zT2YoKSBmaWx0ZXJzIG91dCBkaXNhYmxlZCB0d2VlbnMsIGFuZCB3ZSBoYXZlIHRvIG1hcmsgdGhlbSBhcyBfZ2MgPSB0cnVlIHdoZW4gdGhlIHRpbWVsaW5lIGNvbXBsZXRlcyBpbiBvcmRlciB0byBhbGxvdyBjbGVhbiBnYXJiYWdlIGNvbGxlY3Rpb24sIHNvIHRlbXBvcmFyaWx5IHJlLWVuYWJsZSB0aGUgdGltZWxpbmUgaGVyZS5cblx0XHRcdH1cblx0XHRcdHR3ZWVucyA9IFR3ZWVuTGl0ZS5nZXRUd2VlbnNPZih0YXJnZXQpO1xuXHRcdFx0aSA9IHR3ZWVucy5sZW5ndGg7XG5cdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0aWYgKHR3ZWVuc1tpXS50aW1lbGluZSA9PT0gdGhpcyB8fCAobmVzdGVkICYmIHRoaXMuX2NvbnRhaW5zKHR3ZWVuc1tpXSkpKSB7XG5cdFx0XHRcdFx0YVtjbnQrK10gPSB0d2VlbnNbaV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChkaXNhYmxlZCkge1xuXHRcdFx0XHR0aGlzLl9lbmFibGVkKGZhbHNlLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhO1xuXHRcdH07XG5cblx0XHRwLnJlY2VudCA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlY2VudDtcblx0XHR9O1xuXG5cdFx0cC5fY29udGFpbnMgPSBmdW5jdGlvbih0d2Vlbikge1xuXHRcdFx0dmFyIHRsID0gdHdlZW4udGltZWxpbmU7XG5cdFx0XHR3aGlsZSAodGwpIHtcblx0XHRcdFx0aWYgKHRsID09PSB0aGlzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGwgPSB0bC50aW1lbGluZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0cC5zaGlmdENoaWxkcmVuID0gZnVuY3Rpb24oYW1vdW50LCBhZGp1c3RMYWJlbHMsIGlnbm9yZUJlZm9yZVRpbWUpIHtcblx0XHRcdGlnbm9yZUJlZm9yZVRpbWUgPSBpZ25vcmVCZWZvcmVUaW1lIHx8IDA7XG5cdFx0XHR2YXIgdHdlZW4gPSB0aGlzLl9maXJzdCxcblx0XHRcdFx0bGFiZWxzID0gdGhpcy5fbGFiZWxzLFxuXHRcdFx0XHRwO1xuXHRcdFx0d2hpbGUgKHR3ZWVuKSB7XG5cdFx0XHRcdGlmICh0d2Vlbi5fc3RhcnRUaW1lID49IGlnbm9yZUJlZm9yZVRpbWUpIHtcblx0XHRcdFx0XHR0d2Vlbi5fc3RhcnRUaW1lICs9IGFtb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0d2VlbiA9IHR3ZWVuLl9uZXh0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFkanVzdExhYmVscykge1xuXHRcdFx0XHRmb3IgKHAgaW4gbGFiZWxzKSB7XG5cdFx0XHRcdFx0aWYgKGxhYmVsc1twXSA+PSBpZ25vcmVCZWZvcmVUaW1lKSB7XG5cdFx0XHRcdFx0XHRsYWJlbHNbcF0gKz0gYW1vdW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX3VuY2FjaGUodHJ1ZSk7XG5cdFx0fTtcblxuXHRcdHAuX2tpbGwgPSBmdW5jdGlvbih2YXJzLCB0YXJnZXQpIHtcblx0XHRcdGlmICghdmFycyAmJiAhdGFyZ2V0KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9lbmFibGVkKGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHR2YXIgdHdlZW5zID0gKCF0YXJnZXQpID8gdGhpcy5nZXRDaGlsZHJlbih0cnVlLCB0cnVlLCBmYWxzZSkgOiB0aGlzLmdldFR3ZWVuc09mKHRhcmdldCksXG5cdFx0XHRcdGkgPSB0d2VlbnMubGVuZ3RoLFxuXHRcdFx0XHRjaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0aWYgKHR3ZWVuc1tpXS5fa2lsbCh2YXJzLCB0YXJnZXQpKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBjaGFuZ2VkO1xuXHRcdH07XG5cblx0XHRwLmNsZWFyID0gZnVuY3Rpb24obGFiZWxzKSB7XG5cdFx0XHR2YXIgdHdlZW5zID0gdGhpcy5nZXRDaGlsZHJlbihmYWxzZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRcdGkgPSB0d2VlbnMubGVuZ3RoO1xuXHRcdFx0dGhpcy5fdGltZSA9IHRoaXMuX3RvdGFsVGltZSA9IDA7XG5cdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0dHdlZW5zW2ldLl9lbmFibGVkKGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobGFiZWxzICE9PSBmYWxzZSkge1xuXHRcdFx0XHR0aGlzLl9sYWJlbHMgPSB7fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl91bmNhY2hlKHRydWUpO1xuXHRcdH07XG5cblx0XHRwLmludmFsaWRhdGUgPSBmdW5jdGlvbigpIHtcblx0XHRcdHZhciB0d2VlbiA9IHRoaXMuX2ZpcnN0O1xuXHRcdFx0d2hpbGUgKHR3ZWVuKSB7XG5cdFx0XHRcdHR3ZWVuLmludmFsaWRhdGUoKTtcblx0XHRcdFx0dHdlZW4gPSB0d2Vlbi5fbmV4dDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBBbmltYXRpb24ucHJvdG90eXBlLmludmFsaWRhdGUuY2FsbCh0aGlzKTs7XG5cdFx0fTtcblxuXHRcdHAuX2VuYWJsZWQgPSBmdW5jdGlvbihlbmFibGVkLCBpZ25vcmVUaW1lbGluZSkge1xuXHRcdFx0aWYgKGVuYWJsZWQgPT09IHRoaXMuX2djKSB7XG5cdFx0XHRcdHZhciB0d2VlbiA9IHRoaXMuX2ZpcnN0O1xuXHRcdFx0XHR3aGlsZSAodHdlZW4pIHtcblx0XHRcdFx0XHR0d2Vlbi5fZW5hYmxlZChlbmFibGVkLCB0cnVlKTtcblx0XHRcdFx0XHR0d2VlbiA9IHR3ZWVuLl9uZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gU2ltcGxlVGltZWxpbmUucHJvdG90eXBlLl9lbmFibGVkLmNhbGwodGhpcywgZW5hYmxlZCwgaWdub3JlVGltZWxpbmUpO1xuXHRcdH07XG5cblx0XHRwLnRvdGFsVGltZSA9IGZ1bmN0aW9uKHRpbWUsIHN1cHByZXNzRXZlbnRzLCB1bmNhcHBlZCkge1xuXHRcdFx0dGhpcy5fZm9yY2luZ1BsYXloZWFkID0gdHJ1ZTtcblx0XHRcdHZhciB2YWwgPSBBbmltYXRpb24ucHJvdG90eXBlLnRvdGFsVGltZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdFx0dGhpcy5fZm9yY2luZ1BsYXloZWFkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4gdmFsO1xuXHRcdH07XG5cblx0XHRwLmR1cmF0aW9uID0gZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdGlmICghYXJndW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAodGhpcy5fZGlydHkpIHtcblx0XHRcdFx0XHR0aGlzLnRvdGFsRHVyYXRpb24oKTsgLy9qdXN0IHRyaWdnZXJzIHJlY2FsY3VsYXRpb25cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZHVyYXRpb247XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5kdXJhdGlvbigpICE9PSAwICYmIHZhbHVlICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMudGltZVNjYWxlKHRoaXMuX2R1cmF0aW9uIC8gdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblxuXHRcdHAudG90YWxEdXJhdGlvbiA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHRpZiAoIWFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2RpcnR5KSB7XG5cdFx0XHRcdFx0dmFyIG1heCA9IDAsXG5cdFx0XHRcdFx0XHR0d2VlbiA9IHRoaXMuX2xhc3QsXG5cdFx0XHRcdFx0XHRwcmV2U3RhcnQgPSA5OTk5OTk5OTk5OTksXG5cdFx0XHRcdFx0XHRwcmV2LCBlbmQ7XG5cdFx0XHRcdFx0d2hpbGUgKHR3ZWVuKSB7XG5cdFx0XHRcdFx0XHRwcmV2ID0gdHdlZW4uX3ByZXY7IC8vcmVjb3JkIGl0IGhlcmUgaW4gY2FzZSB0aGUgdHdlZW4gY2hhbmdlcyBwb3NpdGlvbiBpbiB0aGUgc2VxdWVuY2UuLi5cblx0XHRcdFx0XHRcdGlmICh0d2Vlbi5fZGlydHkpIHtcblx0XHRcdFx0XHRcdFx0dHdlZW4udG90YWxEdXJhdGlvbigpOyAvL2NvdWxkIGNoYW5nZSB0aGUgdHdlZW4uX3N0YXJ0VGltZSwgc28gbWFrZSBzdXJlIHRoZSB0d2VlbidzIGNhY2hlIGlzIGNsZWFuIGJlZm9yZSBhbmFseXppbmcgaXQuXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodHdlZW4uX3N0YXJ0VGltZSA+IHByZXZTdGFydCAmJiB0aGlzLl9zb3J0Q2hpbGRyZW4gJiYgIXR3ZWVuLl9wYXVzZWQpIHsgLy9pbiBjYXNlIG9uZSBvZiB0aGUgdHdlZW5zIHNoaWZ0ZWQgb3V0IG9mIG9yZGVyLCBpdCBuZWVkcyB0byBiZSByZS1pbnNlcnRlZCBpbnRvIHRoZSBjb3JyZWN0IHBvc2l0aW9uIGluIHRoZSBzZXF1ZW5jZVxuXHRcdFx0XHRcdFx0XHR0aGlzLmFkZCh0d2VlbiwgdHdlZW4uX3N0YXJ0VGltZSAtIHR3ZWVuLl9kZWxheSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRwcmV2U3RhcnQgPSB0d2Vlbi5fc3RhcnRUaW1lO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHR3ZWVuLl9zdGFydFRpbWUgPCAwICYmICF0d2Vlbi5fcGF1c2VkKSB7IC8vY2hpbGRyZW4gYXJlbid0IGFsbG93ZWQgdG8gaGF2ZSBuZWdhdGl2ZSBzdGFydFRpbWVzIHVubGVzcyBzbW9vdGhDaGlsZFRpbWluZyBpcyB0cnVlLCBzbyBhZGp1c3QgaGVyZSBpZiBvbmUgaXMgZm91bmQuXG5cdFx0XHRcdFx0XHRcdG1heCAtPSB0d2Vlbi5fc3RhcnRUaW1lO1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5fdGltZWxpbmUuc21vb3RoQ2hpbGRUaW1pbmcpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9zdGFydFRpbWUgKz0gdHdlZW4uX3N0YXJ0VGltZSAvIHRoaXMuX3RpbWVTY2FsZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0aGlzLnNoaWZ0Q2hpbGRyZW4oLXR3ZWVuLl9zdGFydFRpbWUsIGZhbHNlLCAtOTk5OTk5OTk5OSk7XG5cdFx0XHRcdFx0XHRcdHByZXZTdGFydCA9IDA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbmQgPSB0d2Vlbi5fc3RhcnRUaW1lICsgKHR3ZWVuLl90b3RhbER1cmF0aW9uIC8gdHdlZW4uX3RpbWVTY2FsZSk7XG5cdFx0XHRcdFx0XHRpZiAoZW5kID4gbWF4KSB7XG5cdFx0XHRcdFx0XHRcdG1heCA9IGVuZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHR3ZWVuID0gcHJldjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fZHVyYXRpb24gPSB0aGlzLl90b3RhbER1cmF0aW9uID0gbWF4O1xuXHRcdFx0XHRcdHRoaXMuX2RpcnR5ID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvdGFsRHVyYXRpb247XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy50b3RhbER1cmF0aW9uKCkgIT09IDApIGlmICh2YWx1ZSAhPT0gMCkge1xuXHRcdFx0XHR0aGlzLnRpbWVTY2FsZSh0aGlzLl90b3RhbER1cmF0aW9uIC8gdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblxuXHRcdHAucGF1c2VkID0gZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdGlmICghdmFsdWUpIHsgLy9pZiB0aGVyZSdzIGEgcGF1c2UgZGlyZWN0bHkgYXQgdGhlIHNwb3QgZnJvbSB3aGVyZSB3ZSdyZSB1bnBhdXNpbmcsIHNraXAgaXQuXG5cdFx0XHRcdHZhciB0d2VlbiA9IHRoaXMuX2ZpcnN0LFxuXHRcdFx0XHRcdHRpbWUgPSB0aGlzLl90aW1lO1xuXHRcdFx0XHR3aGlsZSAodHdlZW4pIHtcblx0XHRcdFx0XHRpZiAodHdlZW4uX3N0YXJ0VGltZSA9PT0gdGltZSAmJiB0d2Vlbi5kYXRhID09PSBcImlzUGF1c2VcIikge1xuXHRcdFx0XHRcdFx0dHdlZW4uX3Jhd1ByZXZUaW1lID0gMDsgLy9yZW1lbWJlciwgX3Jhd1ByZXZUaW1lIGlzIGhvdyB6ZXJvLWR1cmF0aW9uIHR3ZWVucy9jYWxsYmFja3Mgc2Vuc2UgZGlyZWN0aW9uYWxpdHkgYW5kIGRldGVybWluZSB3aGV0aGVyIG9yIG5vdCB0byBmaXJlLiBJZiBfcmF3UHJldlRpbWUgaXMgdGhlIHNhbWUgYXMgX3N0YXJ0VGltZSBvbiB0aGUgbmV4dCByZW5kZXIsIGl0IHdvbid0IGZpcmUuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHR3ZWVuID0gdHdlZW4uX25leHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBBbmltYXRpb24ucHJvdG90eXBlLnBhdXNlZC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdH07XG5cblx0XHRwLnVzZXNGcmFtZXMgPSBmdW5jdGlvbigpIHtcblx0XHRcdHZhciB0bCA9IHRoaXMuX3RpbWVsaW5lO1xuXHRcdFx0d2hpbGUgKHRsLl90aW1lbGluZSkge1xuXHRcdFx0XHR0bCA9IHRsLl90aW1lbGluZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAodGwgPT09IEFuaW1hdGlvbi5fcm9vdEZyYW1lc1RpbWVsaW5lKTtcblx0XHR9O1xuXG5cdFx0cC5yYXdUaW1lID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGF1c2VkID8gdGhpcy5fdG90YWxUaW1lIDogKHRoaXMuX3RpbWVsaW5lLnJhd1RpbWUoKSAtIHRoaXMuX3N0YXJ0VGltZSkgKiB0aGlzLl90aW1lU2NhbGU7XG5cdFx0fTtcblxuXHRcdHJldHVybiBUaW1lbGluZUxpdGU7XG5cblx0fSwgdHJ1ZSk7XG5cblxufSk7IGlmIChfZ3NTY29wZS5fZ3NEZWZpbmUpIHsgX2dzU2NvcGUuX2dzUXVldWUucG9wKCkoKTsgfVxuXG4vL2V4cG9ydCB0byBBTUQvUmVxdWlyZUpTIGFuZCBDb21tb25KUy9Ob2RlIChwcmVjdXJzb3IgdG8gZnVsbCBtb2R1bGFyIGJ1aWxkIHN5c3RlbSBjb21pbmcgYXQgYSBsYXRlciBkYXRlKVxuKGZ1bmN0aW9uKG5hbWUpIHtcblx0XCJ1c2Ugc3RyaWN0XCI7XG5cdHZhciBnZXRHbG9iYWwgPSBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gKF9nc1Njb3BlLkdyZWVuU29ja0dsb2JhbHMgfHwgX2dzU2NvcGUpW25hbWVdO1xuXHR9O1xuXHRpZiAodHlwZW9mKGRlZmluZSkgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7IC8vQU1EXG5cdFx0ZGVmaW5lKFtcIlR3ZWVuTGl0ZVwiXSwgZ2V0R2xvYmFsKTtcblx0fSBlbHNlIGlmICh0eXBlb2YobW9kdWxlKSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBtb2R1bGUuZXhwb3J0cykgeyAvL25vZGVcblx0XHRyZXF1aXJlKFwiLi9Ud2VlbkxpdGUuanNcIik7IC8vZGVwZW5kZW5jeVxuXHRcdG1vZHVsZS5leHBvcnRzID0gZ2V0R2xvYmFsKCk7XG5cdH1cbn0oXCJUaW1lbGluZUxpdGVcIikpO1xuIiwiLyohXG4gKiBWRVJTSU9OOiAxLjE4LjBcbiAqIERBVEU6IDIwMTUtMDktMDNcbiAqIFVQREFURVMgQU5EIERPQ1MgQVQ6IGh0dHA6Ly9ncmVlbnNvY2suY29tXG4gKlxuICogQGxpY2Vuc2UgQ29weXJpZ2h0IChjKSAyMDA4LTIwMTUsIEdyZWVuU29jay4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgd29yayBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBhdCBodHRwOi8vZ3JlZW5zb2NrLmNvbS9zdGFuZGFyZC1saWNlbnNlIG9yIGZvclxuICogQ2x1YiBHcmVlblNvY2sgbWVtYmVycywgdGhlIHNvZnR3YXJlIGFncmVlbWVudCB0aGF0IHdhcyBpc3N1ZWQgd2l0aCB5b3VyIG1lbWJlcnNoaXAuXG4gKiBcbiAqIEBhdXRob3I6IEphY2sgRG95bGUsIGphY2tAZ3JlZW5zb2NrLmNvbVxuICovXG4oZnVuY3Rpb24od2luZG93LCBtb2R1bGVOYW1lKSB7XG5cblx0XHRcInVzZSBzdHJpY3RcIjtcblx0XHR2YXIgX2dsb2JhbHMgPSB3aW5kb3cuR3JlZW5Tb2NrR2xvYmFscyA9IHdpbmRvdy5HcmVlblNvY2tHbG9iYWxzIHx8IHdpbmRvdztcblx0XHRpZiAoX2dsb2JhbHMuVHdlZW5MaXRlKSB7XG5cdFx0XHRyZXR1cm47IC8vaW4gY2FzZSB0aGUgY29yZSBzZXQgb2YgY2xhc3NlcyBpcyBhbHJlYWR5IGxvYWRlZCwgZG9uJ3QgaW5zdGFudGlhdGUgdHdpY2UuXG5cdFx0fVxuXHRcdHZhciBfbmFtZXNwYWNlID0gZnVuY3Rpb24obnMpIHtcblx0XHRcdFx0dmFyIGEgPSBucy5zcGxpdChcIi5cIiksXG5cdFx0XHRcdFx0cCA9IF9nbG9iYWxzLCBpO1xuXHRcdFx0XHRmb3IgKGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHBbYVtpXV0gPSBwID0gcFthW2ldXSB8fCB7fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcDtcblx0XHRcdH0sXG5cdFx0XHRncyA9IF9uYW1lc3BhY2UoXCJjb20uZ3JlZW5zb2NrXCIpLFxuXHRcdFx0X3RpbnlOdW0gPSAwLjAwMDAwMDAwMDEsXG5cdFx0XHRfc2xpY2UgPSBmdW5jdGlvbihhKSB7IC8vZG9uJ3QgdXNlIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRhcmdldCwgMCkgYmVjYXVzZSB0aGF0IGRvZXNuJ3Qgd29yayBpbiBJRTggd2l0aCBhIE5vZGVMaXN0IHRoYXQncyByZXR1cm5lZCBieSBxdWVyeVNlbGVjdG9yQWxsKClcblx0XHRcdFx0dmFyIGIgPSBbXSxcblx0XHRcdFx0XHRsID0gYS5sZW5ndGgsXG5cdFx0XHRcdFx0aTtcblx0XHRcdFx0Zm9yIChpID0gMDsgaSAhPT0gbDsgYi5wdXNoKGFbaSsrXSkpIHt9XG5cdFx0XHRcdHJldHVybiBiO1xuXHRcdFx0fSxcblx0XHRcdF9lbXB0eUZ1bmMgPSBmdW5jdGlvbigpIHt9LFxuXHRcdFx0X2lzQXJyYXkgPSAoZnVuY3Rpb24oKSB7IC8vd29ya3MgYXJvdW5kIGlzc3VlcyBpbiBpZnJhbWUgZW52aXJvbm1lbnRzIHdoZXJlIHRoZSBBcnJheSBnbG9iYWwgaXNuJ3Qgc2hhcmVkLCB0aHVzIGlmIHRoZSBvYmplY3Qgb3JpZ2luYXRlcyBpbiBhIGRpZmZlcmVudCB3aW5kb3cvaWZyYW1lLCBcIihvYmogaW5zdGFuY2VvZiBBcnJheSlcIiB3aWxsIGV2YWx1YXRlIGZhbHNlLiBXZSBhZGRlZCBzb21lIHNwZWVkIG9wdGltaXphdGlvbnMgdG8gYXZvaWQgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKCkgdW5sZXNzIGl0J3MgYWJzb2x1dGVseSBuZWNlc3NhcnkgYmVjYXVzZSBpdCdzIFZFUlkgc2xvdyAobGlrZSAyMHggc2xvd2VyKVxuXHRcdFx0XHR2YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLFxuXHRcdFx0XHRcdGFycmF5ID0gdG9TdHJpbmcuY2FsbChbXSk7XG5cdFx0XHRcdHJldHVybiBmdW5jdGlvbihvYmopIHtcblx0XHRcdFx0XHRyZXR1cm4gb2JqICE9IG51bGwgJiYgKG9iaiBpbnN0YW5jZW9mIEFycmF5IHx8ICh0eXBlb2Yob2JqKSA9PT0gXCJvYmplY3RcIiAmJiAhIW9iai5wdXNoICYmIHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gYXJyYXkpKTtcblx0XHRcdFx0fTtcblx0XHRcdH0oKSksXG5cdFx0XHRhLCBpLCBwLCBfdGlja2VyLCBfdGlja2VyQWN0aXZlLFxuXHRcdFx0X2RlZkxvb2t1cCA9IHt9LFxuXG5cdFx0XHQvKipcblx0XHRcdCAqIEBjb25zdHJ1Y3RvclxuXHRcdFx0ICogRGVmaW5lcyBhIEdyZWVuU29jayBjbGFzcywgb3B0aW9uYWxseSB3aXRoIGFuIGFycmF5IG9mIGRlcGVuZGVuY2llcyB0aGF0IG11c3QgYmUgaW5zdGFudGlhdGVkIGZpcnN0IGFuZCBwYXNzZWQgaW50byB0aGUgZGVmaW5pdGlvbi5cblx0XHRcdCAqIFRoaXMgYWxsb3dzIHVzZXJzIHRvIGxvYWQgR3JlZW5Tb2NrIEpTIGZpbGVzIGluIGFueSBvcmRlciBldmVuIGlmIHRoZXkgaGF2ZSBpbnRlcmRlcGVuZGVuY2llcyAobGlrZSBDU1NQbHVnaW4gZXh0ZW5kcyBUd2VlblBsdWdpbiB3aGljaCBpc1xuXHRcdFx0ICogaW5zaWRlIFR3ZWVuTGl0ZS5qcywgYnV0IGlmIENTU1BsdWdpbiBpcyBsb2FkZWQgZmlyc3QsIGl0IHNob3VsZCB3YWl0IHRvIHJ1biBpdHMgY29kZSB1bnRpbCBUd2VlbkxpdGUuanMgbG9hZHMgYW5kIGluc3RhbnRpYXRlcyBUd2VlblBsdWdpblxuXHRcdFx0ICogYW5kIHRoZW4gcGFzcyBUd2VlblBsdWdpbiB0byBDU1NQbHVnaW4ncyBkZWZpbml0aW9uKS4gVGhpcyBpcyBhbGwgZG9uZSBhdXRvbWF0aWNhbGx5IGFuZCBpbnRlcm5hbGx5LlxuXHRcdFx0ICpcblx0XHRcdCAqIEV2ZXJ5IGRlZmluaXRpb24gd2lsbCBiZSBhZGRlZCB0byBhIFwiY29tLmdyZWVuc29ja1wiIGdsb2JhbCBvYmplY3QgKHR5cGljYWxseSB3aW5kb3csIGJ1dCBpZiBhIHdpbmRvdy5HcmVlblNvY2tHbG9iYWxzIG9iamVjdCBpcyBmb3VuZCxcblx0XHRcdCAqIGl0IHdpbGwgZ28gdGhlcmUgYXMgb2YgdjEuNykuIEZvciBleGFtcGxlLCBUd2VlbkxpdGUgd2lsbCBiZSBmb3VuZCBhdCB3aW5kb3cuY29tLmdyZWVuc29jay5Ud2VlbkxpdGUgYW5kIHNpbmNlIGl0J3MgYSBnbG9iYWwgY2xhc3MgdGhhdCBzaG91bGQgYmUgYXZhaWxhYmxlIGFueXdoZXJlLFxuXHRcdFx0ICogaXQgaXMgQUxTTyByZWZlcmVuY2VkIGF0IHdpbmRvdy5Ud2VlbkxpdGUuIEhvd2V2ZXIgc29tZSBjbGFzc2VzIGFyZW4ndCBjb25zaWRlcmVkIGdsb2JhbCwgbGlrZSB0aGUgYmFzZSBjb20uZ3JlZW5zb2NrLmNvcmUuQW5pbWF0aW9uIGNsYXNzLCBzb1xuXHRcdFx0ICogdGhvc2Ugd2lsbCBvbmx5IGJlIGF0IHRoZSBwYWNrYWdlIGxpa2Ugd2luZG93LmNvbS5ncmVlbnNvY2suY29yZS5BbmltYXRpb24uIEFnYWluLCBpZiB5b3UgZGVmaW5lIGEgR3JlZW5Tb2NrR2xvYmFscyBvYmplY3Qgb24gdGhlIHdpbmRvdywgZXZlcnl0aGluZ1xuXHRcdFx0ICogZ2V0cyB0dWNrZWQgbmVhdGx5IGluc2lkZSB0aGVyZSBpbnN0ZWFkIG9mIG9uIHRoZSB3aW5kb3cgZGlyZWN0bHkuIFRoaXMgYWxsb3dzIHlvdSB0byBkbyBhZHZhbmNlZCB0aGluZ3MgbGlrZSBsb2FkIG11bHRpcGxlIHZlcnNpb25zIG9mIEdyZWVuU29ja1xuXHRcdFx0ICogZmlsZXMgYW5kIHB1dCB0aGVtIGludG8gZGlzdGluY3Qgb2JqZWN0cyAoaW1hZ2luZSBhIGJhbm5lciBhZCB1c2VzIGEgbmV3ZXIgdmVyc2lvbiBidXQgdGhlIG1haW4gc2l0ZSB1c2VzIGFuIG9sZGVyIG9uZSkuIEluIHRoYXQgY2FzZSwgeW91IGNvdWxkXG5cdFx0XHQgKiBzYW5kYm94IHRoZSBiYW5uZXIgb25lIGxpa2U6XG5cdFx0XHQgKlxuXHRcdFx0ICogPHNjcmlwdD5cblx0XHRcdCAqICAgICB2YXIgZ3MgPSB3aW5kb3cuR3JlZW5Tb2NrR2xvYmFscyA9IHt9OyAvL3RoZSBuZXdlciB2ZXJzaW9uIHdlJ3JlIGFib3V0IHRvIGxvYWQgY291bGQgbm93IGJlIHJlZmVyZW5jZWQgaW4gYSBcImdzXCIgb2JqZWN0LCBsaWtlIGdzLlR3ZWVuTGl0ZS50byguLi4pLiBVc2Ugd2hhdGV2ZXIgYWxpYXMgeW91IHdhbnQgYXMgbG9uZyBhcyBpdCdzIHVuaXF1ZSwgXCJnc1wiIG9yIFwiYmFubmVyXCIgb3Igd2hhdGV2ZXIuXG5cdFx0XHQgKiA8L3NjcmlwdD5cblx0XHRcdCAqIDxzY3JpcHQgc3JjPVwianMvZ3JlZW5zb2NrL3YxLjcvVHdlZW5NYXguanNcIj48L3NjcmlwdD5cblx0XHRcdCAqIDxzY3JpcHQ+XG5cdFx0XHQgKiAgICAgd2luZG93LkdyZWVuU29ja0dsb2JhbHMgPSB3aW5kb3cuX2dzUXVldWUgPSB3aW5kb3cuX2dzRGVmaW5lID0gbnVsbDsgLy9yZXNldCBpdCBiYWNrIHRvIG51bGwgKGFsb25nIHdpdGggdGhlIHNwZWNpYWwgX2dzUXVldWUgdmFyaWFibGUpIHNvIHRoYXQgdGhlIG5leHQgbG9hZCBvZiBUd2Vlbk1heCBhZmZlY3RzIHRoZSB3aW5kb3cgYW5kIHdlIGNhbiByZWZlcmVuY2UgdGhpbmdzIGRpcmVjdGx5IGxpa2UgVHdlZW5MaXRlLnRvKC4uLilcblx0XHRcdCAqIDwvc2NyaXB0PlxuXHRcdFx0ICogPHNjcmlwdCBzcmM9XCJqcy9ncmVlbnNvY2svdjEuNi9Ud2Vlbk1heC5qc1wiPjwvc2NyaXB0PlxuXHRcdFx0ICogPHNjcmlwdD5cblx0XHRcdCAqICAgICBncy5Ud2VlbkxpdGUudG8oLi4uKTsgLy93b3VsZCB1c2UgdjEuN1xuXHRcdFx0ICogICAgIFR3ZWVuTGl0ZS50byguLi4pOyAvL3dvdWxkIHVzZSB2MS42XG5cdFx0XHQgKiA8L3NjcmlwdD5cblx0XHRcdCAqXG5cdFx0XHQgKiBAcGFyYW0geyFzdHJpbmd9IG5zIFRoZSBuYW1lc3BhY2Ugb2YgdGhlIGNsYXNzIGRlZmluaXRpb24sIGxlYXZpbmcgb2ZmIFwiY29tLmdyZWVuc29jay5cIiBhcyB0aGF0J3MgYXNzdW1lZC4gRm9yIGV4YW1wbGUsIFwiVHdlZW5MaXRlXCIgb3IgXCJwbHVnaW5zLkNTU1BsdWdpblwiIG9yIFwiZWFzaW5nLkJhY2tcIi5cblx0XHRcdCAqIEBwYXJhbSB7IUFycmF5LjxzdHJpbmc+fSBkZXBlbmRlbmNpZXMgQW4gYXJyYXkgb2YgZGVwZW5kZW5jaWVzIChkZXNjcmliZWQgYXMgdGhlaXIgbmFtZXNwYWNlcyBtaW51cyBcImNvbS5ncmVlbnNvY2suXCIgcHJlZml4KS4gRm9yIGV4YW1wbGUgW1wiVHdlZW5MaXRlXCIsXCJwbHVnaW5zLlR3ZWVuUGx1Z2luXCIsXCJjb3JlLkFuaW1hdGlvblwiXVxuXHRcdFx0ICogQHBhcmFtIHshZnVuY3Rpb24oKTpPYmplY3R9IGZ1bmMgVGhlIGZ1bmN0aW9uIHRoYXQgc2hvdWxkIGJlIGNhbGxlZCBhbmQgcGFzc2VkIHRoZSByZXNvbHZlZCBkZXBlbmRlbmNpZXMgd2hpY2ggd2lsbCByZXR1cm4gdGhlIGFjdHVhbCBjbGFzcyBmb3IgdGhpcyBkZWZpbml0aW9uLlxuXHRcdFx0ICogQHBhcmFtIHtib29sZWFuPX0gZ2xvYmFsIElmIHRydWUsIHRoZSBjbGFzcyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBnbG9iYWwgc2NvcGUgKHR5cGljYWxseSB3aW5kb3cgdW5sZXNzIHlvdSBkZWZpbmUgYSB3aW5kb3cuR3JlZW5Tb2NrR2xvYmFscyBvYmplY3QpXG5cdFx0XHQgKi9cblx0XHRcdERlZmluaXRpb24gPSBmdW5jdGlvbihucywgZGVwZW5kZW5jaWVzLCBmdW5jLCBnbG9iYWwpIHtcblx0XHRcdFx0dGhpcy5zYyA9IChfZGVmTG9va3VwW25zXSkgPyBfZGVmTG9va3VwW25zXS5zYyA6IFtdOyAvL3N1YmNsYXNzZXNcblx0XHRcdFx0X2RlZkxvb2t1cFtuc10gPSB0aGlzO1xuXHRcdFx0XHR0aGlzLmdzQ2xhc3MgPSBudWxsO1xuXHRcdFx0XHR0aGlzLmZ1bmMgPSBmdW5jO1xuXHRcdFx0XHR2YXIgX2NsYXNzZXMgPSBbXTtcblx0XHRcdFx0dGhpcy5jaGVjayA9IGZ1bmN0aW9uKGluaXQpIHtcblx0XHRcdFx0XHR2YXIgaSA9IGRlcGVuZGVuY2llcy5sZW5ndGgsXG5cdFx0XHRcdFx0XHRtaXNzaW5nID0gaSxcblx0XHRcdFx0XHRcdGN1ciwgYSwgbiwgY2wsIGhhc01vZHVsZTtcblx0XHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHRcdGlmICgoY3VyID0gX2RlZkxvb2t1cFtkZXBlbmRlbmNpZXNbaV1dIHx8IG5ldyBEZWZpbml0aW9uKGRlcGVuZGVuY2llc1tpXSwgW10pKS5nc0NsYXNzKSB7XG5cdFx0XHRcdFx0XHRcdF9jbGFzc2VzW2ldID0gY3VyLmdzQ2xhc3M7XG5cdFx0XHRcdFx0XHRcdG1pc3NpbmctLTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaW5pdCkge1xuXHRcdFx0XHRcdFx0XHRjdXIuc2MucHVzaCh0aGlzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1pc3NpbmcgPT09IDAgJiYgZnVuYykge1xuXHRcdFx0XHRcdFx0YSA9IChcImNvbS5ncmVlbnNvY2suXCIgKyBucykuc3BsaXQoXCIuXCIpO1xuXHRcdFx0XHRcdFx0biA9IGEucG9wKCk7XG5cdFx0XHRcdFx0XHRjbCA9IF9uYW1lc3BhY2UoYS5qb2luKFwiLlwiKSlbbl0gPSB0aGlzLmdzQ2xhc3MgPSBmdW5jLmFwcGx5KGZ1bmMsIF9jbGFzc2VzKTtcblxuXHRcdFx0XHRcdFx0Ly9leHBvcnRzIHRvIG11bHRpcGxlIGVudmlyb25tZW50c1xuXHRcdFx0XHRcdFx0aWYgKGdsb2JhbCkge1xuXHRcdFx0XHRcdFx0XHRfZ2xvYmFsc1tuXSA9IGNsOyAvL3Byb3ZpZGVzIGEgd2F5IHRvIGF2b2lkIGdsb2JhbCBuYW1lc3BhY2UgcG9sbHV0aW9uLiBCeSBkZWZhdWx0LCB0aGUgbWFpbiBjbGFzc2VzIGxpa2UgVHdlZW5MaXRlLCBQb3dlcjEsIFN0cm9uZywgZXRjLiBhcmUgYWRkZWQgdG8gd2luZG93IHVubGVzcyBhIEdyZWVuU29ja0dsb2JhbHMgaXMgZGVmaW5lZC4gU28gaWYgeW91IHdhbnQgdG8gaGF2ZSB0aGluZ3MgYWRkZWQgdG8gYSBjdXN0b20gb2JqZWN0IGluc3RlYWQsIGp1c3QgZG8gc29tZXRoaW5nIGxpa2Ugd2luZG93LkdyZWVuU29ja0dsb2JhbHMgPSB7fSBiZWZvcmUgbG9hZGluZyBhbnkgR3JlZW5Tb2NrIGZpbGVzLiBZb3UgY2FuIGV2ZW4gc2V0IHVwIGFuIGFsaWFzIGxpa2Ugd2luZG93LkdyZWVuU29ja0dsb2JhbHMgPSB3aW5kb3dzLmdzID0ge30gc28gdGhhdCB5b3UgY2FuIGFjY2VzcyBldmVyeXRoaW5nIGxpa2UgZ3MuVHdlZW5MaXRlLiBBbHNvIHJlbWVtYmVyIHRoYXQgQUxMIGNsYXNzZXMgYXJlIGFkZGVkIHRvIHRoZSB3aW5kb3cuY29tLmdyZWVuc29jayBvYmplY3QgKGluIHRoZWlyIHJlc3BlY3RpdmUgcGFja2FnZXMsIGxpa2UgY29tLmdyZWVuc29jay5lYXNpbmcuUG93ZXIxLCBjb20uZ3JlZW5zb2NrLlR3ZWVuTGl0ZSwgZXRjLilcblx0XHRcdFx0XHRcdFx0aGFzTW9kdWxlID0gKHR5cGVvZihtb2R1bGUpICE9PSBcInVuZGVmaW5lZFwiICYmIG1vZHVsZS5leHBvcnRzKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFoYXNNb2R1bGUgJiYgdHlwZW9mKGRlZmluZSkgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKXsgLy9BTURcblx0XHRcdFx0XHRcdFx0XHRkZWZpbmUoKHdpbmRvdy5HcmVlblNvY2tBTURQYXRoID8gd2luZG93LkdyZWVuU29ja0FNRFBhdGggKyBcIi9cIiA6IFwiXCIpICsgbnMuc3BsaXQoXCIuXCIpLnBvcCgpLCBbXSwgZnVuY3Rpb24oKSB7IHJldHVybiBjbDsgfSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAobnMgPT09IG1vZHVsZU5hbWUgJiYgaGFzTW9kdWxlKXsgLy9ub2RlXG5cdFx0XHRcdFx0XHRcdFx0bW9kdWxlLmV4cG9ydHMgPSBjbDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IHRoaXMuc2MubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5zY1tpXS5jaGVjaygpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5jaGVjayh0cnVlKTtcblx0XHRcdH0sXG5cblx0XHRcdC8vdXNlZCB0byBjcmVhdGUgRGVmaW5pdGlvbiBpbnN0YW5jZXMgKHdoaWNoIGJhc2ljYWxseSByZWdpc3RlcnMgYSBjbGFzcyB0aGF0IGhhcyBkZXBlbmRlbmNpZXMpLlxuXHRcdFx0X2dzRGVmaW5lID0gd2luZG93Ll9nc0RlZmluZSA9IGZ1bmN0aW9uKG5zLCBkZXBlbmRlbmNpZXMsIGZ1bmMsIGdsb2JhbCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IERlZmluaXRpb24obnMsIGRlcGVuZGVuY2llcywgZnVuYywgZ2xvYmFsKTtcblx0XHRcdH0sXG5cblx0XHRcdC8vYSBxdWljayB3YXkgdG8gY3JlYXRlIGEgY2xhc3MgdGhhdCBkb2Vzbid0IGhhdmUgYW55IGRlcGVuZGVuY2llcy4gUmV0dXJucyB0aGUgY2xhc3MsIGJ1dCBmaXJzdCByZWdpc3RlcnMgaXQgaW4gdGhlIEdyZWVuU29jayBuYW1lc3BhY2Ugc28gdGhhdCBvdGhlciBjbGFzc2VzIGNhbiBncmFiIGl0IChvdGhlciBjbGFzc2VzIG1pZ2h0IGJlIGRlcGVuZGVudCBvbiB0aGUgY2xhc3MpLlxuXHRcdFx0X2NsYXNzID0gZ3MuX2NsYXNzID0gZnVuY3Rpb24obnMsIGZ1bmMsIGdsb2JhbCkge1xuXHRcdFx0XHRmdW5jID0gZnVuYyB8fCBmdW5jdGlvbigpIHt9O1xuXHRcdFx0XHRfZ3NEZWZpbmUobnMsIFtdLCBmdW5jdGlvbigpeyByZXR1cm4gZnVuYzsgfSwgZ2xvYmFsKTtcblx0XHRcdFx0cmV0dXJuIGZ1bmM7XG5cdFx0XHR9O1xuXG5cdFx0X2dzRGVmaW5lLmdsb2JhbHMgPSBfZ2xvYmFscztcblxuXG5cbi8qXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBFYXNlXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKi9cblx0XHR2YXIgX2Jhc2VQYXJhbXMgPSBbMCwgMCwgMSwgMV0sXG5cdFx0XHRfYmxhbmtBcnJheSA9IFtdLFxuXHRcdFx0RWFzZSA9IF9jbGFzcyhcImVhc2luZy5FYXNlXCIsIGZ1bmN0aW9uKGZ1bmMsIGV4dHJhUGFyYW1zLCB0eXBlLCBwb3dlcikge1xuXHRcdFx0XHR0aGlzLl9mdW5jID0gZnVuYztcblx0XHRcdFx0dGhpcy5fdHlwZSA9IHR5cGUgfHwgMDtcblx0XHRcdFx0dGhpcy5fcG93ZXIgPSBwb3dlciB8fCAwO1xuXHRcdFx0XHR0aGlzLl9wYXJhbXMgPSBleHRyYVBhcmFtcyA/IF9iYXNlUGFyYW1zLmNvbmNhdChleHRyYVBhcmFtcykgOiBfYmFzZVBhcmFtcztcblx0XHRcdH0sIHRydWUpLFxuXHRcdFx0X2Vhc2VNYXAgPSBFYXNlLm1hcCA9IHt9LFxuXHRcdFx0X2Vhc2VSZWcgPSBFYXNlLnJlZ2lzdGVyID0gZnVuY3Rpb24oZWFzZSwgbmFtZXMsIHR5cGVzLCBjcmVhdGUpIHtcblx0XHRcdFx0dmFyIG5hID0gbmFtZXMuc3BsaXQoXCIsXCIpLFxuXHRcdFx0XHRcdGkgPSBuYS5sZW5ndGgsXG5cdFx0XHRcdFx0dGEgPSAodHlwZXMgfHwgXCJlYXNlSW4sZWFzZU91dCxlYXNlSW5PdXRcIikuc3BsaXQoXCIsXCIpLFxuXHRcdFx0XHRcdGUsIG5hbWUsIGosIHR5cGU7XG5cdFx0XHRcdHdoaWxlICgtLWkgPiAtMSkge1xuXHRcdFx0XHRcdG5hbWUgPSBuYVtpXTtcblx0XHRcdFx0XHRlID0gY3JlYXRlID8gX2NsYXNzKFwiZWFzaW5nLlwiK25hbWUsIG51bGwsIHRydWUpIDogZ3MuZWFzaW5nW25hbWVdIHx8IHt9O1xuXHRcdFx0XHRcdGogPSB0YS5sZW5ndGg7XG5cdFx0XHRcdFx0d2hpbGUgKC0taiA+IC0xKSB7XG5cdFx0XHRcdFx0XHR0eXBlID0gdGFbal07XG5cdFx0XHRcdFx0XHRfZWFzZU1hcFtuYW1lICsgXCIuXCIgKyB0eXBlXSA9IF9lYXNlTWFwW3R5cGUgKyBuYW1lXSA9IGVbdHlwZV0gPSBlYXNlLmdldFJhdGlvID8gZWFzZSA6IGVhc2VbdHlwZV0gfHwgbmV3IGVhc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRwID0gRWFzZS5wcm90b3R5cGU7XG5cdFx0cC5fY2FsY0VuZCA9IGZhbHNlO1xuXHRcdHAuZ2V0UmF0aW8gPSBmdW5jdGlvbihwKSB7XG5cdFx0XHRpZiAodGhpcy5fZnVuYykge1xuXHRcdFx0XHR0aGlzLl9wYXJhbXNbMF0gPSBwO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZnVuYy5hcHBseShudWxsLCB0aGlzLl9wYXJhbXMpO1xuXHRcdFx0fVxuXHRcdFx0dmFyIHQgPSB0aGlzLl90eXBlLFxuXHRcdFx0XHRwdyA9IHRoaXMuX3Bvd2VyLFxuXHRcdFx0XHRyID0gKHQgPT09IDEpID8gMSAtIHAgOiAodCA9PT0gMikgPyBwIDogKHAgPCAwLjUpID8gcCAqIDIgOiAoMSAtIHApICogMjtcblx0XHRcdGlmIChwdyA9PT0gMSkge1xuXHRcdFx0XHRyICo9IHI7XG5cdFx0XHR9IGVsc2UgaWYgKHB3ID09PSAyKSB7XG5cdFx0XHRcdHIgKj0gciAqIHI7XG5cdFx0XHR9IGVsc2UgaWYgKHB3ID09PSAzKSB7XG5cdFx0XHRcdHIgKj0gciAqIHIgKiByO1xuXHRcdFx0fSBlbHNlIGlmIChwdyA9PT0gNCkge1xuXHRcdFx0XHRyICo9IHIgKiByICogciAqIHI7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKHQgPT09IDEpID8gMSAtIHIgOiAodCA9PT0gMikgPyByIDogKHAgPCAwLjUpID8gciAvIDIgOiAxIC0gKHIgLyAyKTtcblx0XHR9O1xuXG5cdFx0Ly9jcmVhdGUgYWxsIHRoZSBzdGFuZGFyZCBlYXNlcyBsaWtlIExpbmVhciwgUXVhZCwgQ3ViaWMsIFF1YXJ0LCBRdWludCwgU3Ryb25nLCBQb3dlcjAsIFBvd2VyMSwgUG93ZXIyLCBQb3dlcjMsIGFuZCBQb3dlcjQgKGVhY2ggd2l0aCBlYXNlSW4sIGVhc2VPdXQsIGFuZCBlYXNlSW5PdXQpXG5cdFx0YSA9IFtcIkxpbmVhclwiLFwiUXVhZFwiLFwiQ3ViaWNcIixcIlF1YXJ0XCIsXCJRdWludCxTdHJvbmdcIl07XG5cdFx0aSA9IGEubGVuZ3RoO1xuXHRcdHdoaWxlICgtLWkgPiAtMSkge1xuXHRcdFx0cCA9IGFbaV0rXCIsUG93ZXJcIitpO1xuXHRcdFx0X2Vhc2VSZWcobmV3IEVhc2UobnVsbCxudWxsLDEsaSksIHAsIFwiZWFzZU91dFwiLCB0cnVlKTtcblx0XHRcdF9lYXNlUmVnKG5ldyBFYXNlKG51bGwsbnVsbCwyLGkpLCBwLCBcImVhc2VJblwiICsgKChpID09PSAwKSA/IFwiLGVhc2VOb25lXCIgOiBcIlwiKSk7XG5cdFx0XHRfZWFzZVJlZyhuZXcgRWFzZShudWxsLG51bGwsMyxpKSwgcCwgXCJlYXNlSW5PdXRcIik7XG5cdFx0fVxuXHRcdF9lYXNlTWFwLmxpbmVhciA9IGdzLmVhc2luZy5MaW5lYXIuZWFzZUluO1xuXHRcdF9lYXNlTWFwLnN3aW5nID0gZ3MuZWFzaW5nLlF1YWQuZWFzZUluT3V0OyAvL2ZvciBqUXVlcnkgZm9sa3NcblxuXG4vKlxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogRXZlbnREaXNwYXRjaGVyXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKi9cblx0XHR2YXIgRXZlbnREaXNwYXRjaGVyID0gX2NsYXNzKFwiZXZlbnRzLkV2ZW50RGlzcGF0Y2hlclwiLCBmdW5jdGlvbih0YXJnZXQpIHtcblx0XHRcdHRoaXMuX2xpc3RlbmVycyA9IHt9O1xuXHRcdFx0dGhpcy5fZXZlbnRUYXJnZXQgPSB0YXJnZXQgfHwgdGhpcztcblx0XHR9KTtcblx0XHRwID0gRXZlbnREaXNwYXRjaGVyLnByb3RvdHlwZTtcblxuXHRcdHAuYWRkRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGNhbGxiYWNrLCBzY29wZSwgdXNlUGFyYW0sIHByaW9yaXR5KSB7XG5cdFx0XHRwcmlvcml0eSA9IHByaW9yaXR5IHx8IDA7XG5cdFx0XHR2YXIgbGlzdCA9IHRoaXMuX2xpc3RlbmVyc1t0eXBlXSxcblx0XHRcdFx0aW5kZXggPSAwLFxuXHRcdFx0XHRsaXN0ZW5lciwgaTtcblx0XHRcdGlmIChsaXN0ID09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5fbGlzdGVuZXJzW3R5cGVdID0gbGlzdCA9IFtdO1xuXHRcdFx0fVxuXHRcdFx0aSA9IGxpc3QubGVuZ3RoO1xuXHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdGxpc3RlbmVyID0gbGlzdFtpXTtcblx0XHRcdFx0aWYgKGxpc3RlbmVyLmMgPT09IGNhbGxiYWNrICYmIGxpc3RlbmVyLnMgPT09IHNjb3BlKSB7XG5cdFx0XHRcdFx0bGlzdC5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaW5kZXggPT09IDAgJiYgbGlzdGVuZXIucHIgPCBwcmlvcml0eSkge1xuXHRcdFx0XHRcdGluZGV4ID0gaSArIDE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGxpc3Quc3BsaWNlKGluZGV4LCAwLCB7YzpjYWxsYmFjaywgczpzY29wZSwgdXA6dXNlUGFyYW0sIHByOnByaW9yaXR5fSk7XG5cdFx0XHRpZiAodGhpcyA9PT0gX3RpY2tlciAmJiAhX3RpY2tlckFjdGl2ZSkge1xuXHRcdFx0XHRfdGlja2VyLndha2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cC5yZW1vdmVFdmVudExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgY2FsbGJhY2spIHtcblx0XHRcdHZhciBsaXN0ID0gdGhpcy5fbGlzdGVuZXJzW3R5cGVdLCBpO1xuXHRcdFx0aWYgKGxpc3QpIHtcblx0XHRcdFx0aSA9IGxpc3QubGVuZ3RoO1xuXHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHRpZiAobGlzdFtpXS5jID09PSBjYWxsYmFjaykge1xuXHRcdFx0XHRcdFx0bGlzdC5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHAuZGlzcGF0Y2hFdmVudCA9IGZ1bmN0aW9uKHR5cGUpIHtcblx0XHRcdHZhciBsaXN0ID0gdGhpcy5fbGlzdGVuZXJzW3R5cGVdLFxuXHRcdFx0XHRpLCB0LCBsaXN0ZW5lcjtcblx0XHRcdGlmIChsaXN0KSB7XG5cdFx0XHRcdGkgPSBsaXN0Lmxlbmd0aDtcblx0XHRcdFx0dCA9IHRoaXMuX2V2ZW50VGFyZ2V0O1xuXHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHRsaXN0ZW5lciA9IGxpc3RbaV07XG5cdFx0XHRcdFx0aWYgKGxpc3RlbmVyKSB7XG5cdFx0XHRcdFx0XHRpZiAobGlzdGVuZXIudXApIHtcblx0XHRcdFx0XHRcdFx0bGlzdGVuZXIuYy5jYWxsKGxpc3RlbmVyLnMgfHwgdCwge3R5cGU6dHlwZSwgdGFyZ2V0OnR9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGxpc3RlbmVyLmMuY2FsbChsaXN0ZW5lci5zIHx8IHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblxuLypcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIFRpY2tlclxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICovXG4gXHRcdHZhciBfcmVxQW5pbUZyYW1lID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSxcblx0XHRcdF9jYW5jZWxBbmltRnJhbWUgPSB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUsXG5cdFx0XHRfZ2V0VGltZSA9IERhdGUubm93IHx8IGZ1bmN0aW9uKCkge3JldHVybiBuZXcgRGF0ZSgpLmdldFRpbWUoKTt9LFxuXHRcdFx0X2xhc3RVcGRhdGUgPSBfZ2V0VGltZSgpO1xuXG5cdFx0Ly9ub3cgdHJ5IHRvIGRldGVybWluZSB0aGUgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGFuZCBjYW5jZWxBbmltYXRpb25GcmFtZSBmdW5jdGlvbnMgYW5kIGlmIG5vbmUgYXJlIGZvdW5kLCB3ZSdsbCB1c2UgYSBzZXRUaW1lb3V0KCkvY2xlYXJUaW1lb3V0KCkgcG9seWZpbGwuXG5cdFx0YSA9IFtcIm1zXCIsXCJtb3pcIixcIndlYmtpdFwiLFwib1wiXTtcblx0XHRpID0gYS5sZW5ndGg7XG5cdFx0d2hpbGUgKC0taSA+IC0xICYmICFfcmVxQW5pbUZyYW1lKSB7XG5cdFx0XHRfcmVxQW5pbUZyYW1lID0gd2luZG93W2FbaV0gKyBcIlJlcXVlc3RBbmltYXRpb25GcmFtZVwiXTtcblx0XHRcdF9jYW5jZWxBbmltRnJhbWUgPSB3aW5kb3dbYVtpXSArIFwiQ2FuY2VsQW5pbWF0aW9uRnJhbWVcIl0gfHwgd2luZG93W2FbaV0gKyBcIkNhbmNlbFJlcXVlc3RBbmltYXRpb25GcmFtZVwiXTtcblx0XHR9XG5cblx0XHRfY2xhc3MoXCJUaWNrZXJcIiwgZnVuY3Rpb24oZnBzLCB1c2VSQUYpIHtcblx0XHRcdHZhciBfc2VsZiA9IHRoaXMsXG5cdFx0XHRcdF9zdGFydFRpbWUgPSBfZ2V0VGltZSgpLFxuXHRcdFx0XHRfdXNlUkFGID0gKHVzZVJBRiAhPT0gZmFsc2UgJiYgX3JlcUFuaW1GcmFtZSksXG5cdFx0XHRcdF9sYWdUaHJlc2hvbGQgPSA1MDAsXG5cdFx0XHRcdF9hZGp1c3RlZExhZyA9IDMzLFxuXHRcdFx0XHRfdGlja1dvcmQgPSBcInRpY2tcIiwgLy9oZWxwcyByZWR1Y2UgZ2MgYnVyZGVuXG5cdFx0XHRcdF9mcHMsIF9yZXEsIF9pZCwgX2dhcCwgX25leHRUaW1lLFxuXHRcdFx0XHRfdGljayA9IGZ1bmN0aW9uKG1hbnVhbCkge1xuXHRcdFx0XHRcdHZhciBlbGFwc2VkID0gX2dldFRpbWUoKSAtIF9sYXN0VXBkYXRlLFxuXHRcdFx0XHRcdFx0b3ZlcmxhcCwgZGlzcGF0Y2g7XG5cdFx0XHRcdFx0aWYgKGVsYXBzZWQgPiBfbGFnVGhyZXNob2xkKSB7XG5cdFx0XHRcdFx0XHRfc3RhcnRUaW1lICs9IGVsYXBzZWQgLSBfYWRqdXN0ZWRMYWc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF9sYXN0VXBkYXRlICs9IGVsYXBzZWQ7XG5cdFx0XHRcdFx0X3NlbGYudGltZSA9IChfbGFzdFVwZGF0ZSAtIF9zdGFydFRpbWUpIC8gMTAwMDtcblx0XHRcdFx0XHRvdmVybGFwID0gX3NlbGYudGltZSAtIF9uZXh0VGltZTtcblx0XHRcdFx0XHRpZiAoIV9mcHMgfHwgb3ZlcmxhcCA+IDAgfHwgbWFudWFsID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRfc2VsZi5mcmFtZSsrO1xuXHRcdFx0XHRcdFx0X25leHRUaW1lICs9IG92ZXJsYXAgKyAob3ZlcmxhcCA+PSBfZ2FwID8gMC4wMDQgOiBfZ2FwIC0gb3ZlcmxhcCk7XG5cdFx0XHRcdFx0XHRkaXNwYXRjaCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtYW51YWwgIT09IHRydWUpIHsgLy9tYWtlIHN1cmUgdGhlIHJlcXVlc3QgaXMgbWFkZSBiZWZvcmUgd2UgZGlzcGF0Y2ggdGhlIFwidGlja1wiIGV2ZW50IHNvIHRoYXQgdGltaW5nIGlzIG1haW50YWluZWQuIE90aGVyd2lzZSwgaWYgcHJvY2Vzc2luZyB0aGUgXCJ0aWNrXCIgcmVxdWlyZXMgYSBidW5jaCBvZiB0aW1lIChsaWtlIDE1bXMpIGFuZCB3ZSdyZSB1c2luZyBhIHNldFRpbWVvdXQoKSB0aGF0J3MgYmFzZWQgb24gMTYuN21zLCBpdCdkIHRlY2huaWNhbGx5IHRha2UgMzEuN21zIGJldHdlZW4gZnJhbWVzIG90aGVyd2lzZS5cblx0XHRcdFx0XHRcdF9pZCA9IF9yZXEoX3RpY2spO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGlzcGF0Y2gpIHtcblx0XHRcdFx0XHRcdF9zZWxmLmRpc3BhdGNoRXZlbnQoX3RpY2tXb3JkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdEV2ZW50RGlzcGF0Y2hlci5jYWxsKF9zZWxmKTtcblx0XHRcdF9zZWxmLnRpbWUgPSBfc2VsZi5mcmFtZSA9IDA7XG5cdFx0XHRfc2VsZi50aWNrID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdF90aWNrKHRydWUpO1xuXHRcdFx0fTtcblxuXHRcdFx0X3NlbGYubGFnU21vb3RoaW5nID0gZnVuY3Rpb24odGhyZXNob2xkLCBhZGp1c3RlZExhZykge1xuXHRcdFx0XHRfbGFnVGhyZXNob2xkID0gdGhyZXNob2xkIHx8ICgxIC8gX3RpbnlOdW0pOyAvL3plcm8gc2hvdWxkIGJlIGludGVycHJldGVkIGFzIGJhc2ljYWxseSB1bmxpbWl0ZWRcblx0XHRcdFx0X2FkanVzdGVkTGFnID0gTWF0aC5taW4oYWRqdXN0ZWRMYWcsIF9sYWdUaHJlc2hvbGQsIDApO1xuXHRcdFx0fTtcblxuXHRcdFx0X3NlbGYuc2xlZXAgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0aWYgKF9pZCA9PSBudWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghX3VzZVJBRiB8fCAhX2NhbmNlbEFuaW1GcmFtZSkge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dChfaWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdF9jYW5jZWxBbmltRnJhbWUoX2lkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRfcmVxID0gX2VtcHR5RnVuYztcblx0XHRcdFx0X2lkID0gbnVsbDtcblx0XHRcdFx0aWYgKF9zZWxmID09PSBfdGlja2VyKSB7XG5cdFx0XHRcdFx0X3RpY2tlckFjdGl2ZSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRfc2VsZi53YWtlID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGlmIChfaWQgIT09IG51bGwpIHtcblx0XHRcdFx0XHRfc2VsZi5zbGVlcCgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKF9zZWxmLmZyYW1lID4gMTApIHsgLy9kb24ndCB0cmlnZ2VyIGxhZ1Ntb290aGluZyBpZiB3ZSdyZSBqdXN0IHdha2luZyB1cCwgYW5kIG1ha2Ugc3VyZSB0aGF0IGF0IGxlYXN0IDEwIGZyYW1lcyBoYXZlIGVsYXBzZWQgYmVjYXVzZSBvZiB0aGUgaU9TIGJ1ZyB0aGF0IHdlIHdvcmsgYXJvdW5kIGJlbG93IHdpdGggdGhlIDEuNS1zZWNvbmQgc2V0VGltb3V0KCkuXG5cdFx0XHRcdFx0X2xhc3RVcGRhdGUgPSBfZ2V0VGltZSgpIC0gX2xhZ1RocmVzaG9sZCArIDU7XG5cdFx0XHRcdH1cblx0XHRcdFx0X3JlcSA9IChfZnBzID09PSAwKSA/IF9lbXB0eUZ1bmMgOiAoIV91c2VSQUYgfHwgIV9yZXFBbmltRnJhbWUpID8gZnVuY3Rpb24oZikgeyByZXR1cm4gc2V0VGltZW91dChmLCAoKF9uZXh0VGltZSAtIF9zZWxmLnRpbWUpICogMTAwMCArIDEpIHwgMCk7IH0gOiBfcmVxQW5pbUZyYW1lO1xuXHRcdFx0XHRpZiAoX3NlbGYgPT09IF90aWNrZXIpIHtcblx0XHRcdFx0XHRfdGlja2VyQWN0aXZlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRfdGljaygyKTtcblx0XHRcdH07XG5cblx0XHRcdF9zZWxmLmZwcyA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHRcdGlmICghYXJndW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBfZnBzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdF9mcHMgPSB2YWx1ZTtcblx0XHRcdFx0X2dhcCA9IDEgLyAoX2ZwcyB8fCA2MCk7XG5cdFx0XHRcdF9uZXh0VGltZSA9IHRoaXMudGltZSArIF9nYXA7XG5cdFx0XHRcdF9zZWxmLndha2UoKTtcblx0XHRcdH07XG5cblx0XHRcdF9zZWxmLnVzZVJBRiA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHRcdGlmICghYXJndW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBfdXNlUkFGO1xuXHRcdFx0XHR9XG5cdFx0XHRcdF9zZWxmLnNsZWVwKCk7XG5cdFx0XHRcdF91c2VSQUYgPSB2YWx1ZTtcblx0XHRcdFx0X3NlbGYuZnBzKF9mcHMpO1xuXHRcdFx0fTtcblx0XHRcdF9zZWxmLmZwcyhmcHMpO1xuXG5cdFx0XHQvL2EgYnVnIGluIGlPUyA2IFNhZmFyaSBvY2Nhc2lvbmFsbHkgcHJldmVudHMgdGhlIHJlcXVlc3RBbmltYXRpb25GcmFtZSBmcm9tIHdvcmtpbmcgaW5pdGlhbGx5LCBzbyB3ZSB1c2UgYSAxLjUtc2Vjb25kIHRpbWVvdXQgdGhhdCBhdXRvbWF0aWNhbGx5IGZhbGxzIGJhY2sgdG8gc2V0VGltZW91dCgpIGlmIGl0IHNlbnNlcyB0aGlzIGNvbmRpdGlvbi5cblx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGlmIChfdXNlUkFGICYmIF9zZWxmLmZyYW1lIDwgNSkge1xuXHRcdFx0XHRcdF9zZWxmLnVzZVJBRihmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDE1MDApO1xuXHRcdH0pO1xuXG5cdFx0cCA9IGdzLlRpY2tlci5wcm90b3R5cGUgPSBuZXcgZ3MuZXZlbnRzLkV2ZW50RGlzcGF0Y2hlcigpO1xuXHRcdHAuY29uc3RydWN0b3IgPSBncy5UaWNrZXI7XG5cblxuLypcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIEFuaW1hdGlvblxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICovXG5cdFx0dmFyIEFuaW1hdGlvbiA9IF9jbGFzcyhcImNvcmUuQW5pbWF0aW9uXCIsIGZ1bmN0aW9uKGR1cmF0aW9uLCB2YXJzKSB7XG5cdFx0XHRcdHRoaXMudmFycyA9IHZhcnMgPSB2YXJzIHx8IHt9O1xuXHRcdFx0XHR0aGlzLl9kdXJhdGlvbiA9IHRoaXMuX3RvdGFsRHVyYXRpb24gPSBkdXJhdGlvbiB8fCAwO1xuXHRcdFx0XHR0aGlzLl9kZWxheSA9IE51bWJlcih2YXJzLmRlbGF5KSB8fCAwO1xuXHRcdFx0XHR0aGlzLl90aW1lU2NhbGUgPSAxO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmUgPSAodmFycy5pbW1lZGlhdGVSZW5kZXIgPT09IHRydWUpO1xuXHRcdFx0XHR0aGlzLmRhdGEgPSB2YXJzLmRhdGE7XG5cdFx0XHRcdHRoaXMuX3JldmVyc2VkID0gKHZhcnMucmV2ZXJzZWQgPT09IHRydWUpO1xuXG5cdFx0XHRcdGlmICghX3Jvb3RUaW1lbGluZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIV90aWNrZXJBY3RpdmUpIHsgLy9zb21lIGJyb3dzZXJzIChsaWtlIGlPUyA2IFNhZmFyaSkgc2h1dCBkb3duIEphdmFTY3JpcHQgZXhlY3V0aW9uIHdoZW4gdGhlIHRhYiBpcyBkaXNhYmxlZCBhbmQgdGhleSBbb2NjYXNpb25hbGx5XSBuZWdsZWN0IHRvIHN0YXJ0IHVwIHJlcXVlc3RBbmltYXRpb25GcmFtZSBhZ2FpbiB3aGVuIHJldHVybmluZyAtIHRoaXMgY29kZSBlbnN1cmVzIHRoYXQgdGhlIGVuZ2luZSBzdGFydHMgdXAgYWdhaW4gcHJvcGVybHkuXG5cdFx0XHRcdFx0X3RpY2tlci53YWtlKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR2YXIgdGwgPSB0aGlzLnZhcnMudXNlRnJhbWVzID8gX3Jvb3RGcmFtZXNUaW1lbGluZSA6IF9yb290VGltZWxpbmU7XG5cdFx0XHRcdHRsLmFkZCh0aGlzLCB0bC5fdGltZSk7XG5cblx0XHRcdFx0aWYgKHRoaXMudmFycy5wYXVzZWQpIHtcblx0XHRcdFx0XHR0aGlzLnBhdXNlZCh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRfdGlja2VyID0gQW5pbWF0aW9uLnRpY2tlciA9IG5ldyBncy5UaWNrZXIoKTtcblx0XHRwID0gQW5pbWF0aW9uLnByb3RvdHlwZTtcblx0XHRwLl9kaXJ0eSA9IHAuX2djID0gcC5faW5pdHRlZCA9IHAuX3BhdXNlZCA9IGZhbHNlO1xuXHRcdHAuX3RvdGFsVGltZSA9IHAuX3RpbWUgPSAwO1xuXHRcdHAuX3Jhd1ByZXZUaW1lID0gLTE7XG5cdFx0cC5fbmV4dCA9IHAuX2xhc3QgPSBwLl9vblVwZGF0ZSA9IHAuX3RpbWVsaW5lID0gcC50aW1lbGluZSA9IG51bGw7XG5cdFx0cC5fcGF1c2VkID0gZmFsc2U7XG5cblxuXHRcdC8vc29tZSBicm93c2VycyAobGlrZSBpT1MpIG9jY2FzaW9uYWxseSBkcm9wIHRoZSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgZXZlbnQgd2hlbiB0aGUgdXNlciBzd2l0Y2hlcyB0byBhIGRpZmZlcmVudCB0YWIgYW5kIHRoZW4gY29tZXMgYmFjayBhZ2Fpbiwgc28gd2UgdXNlIGEgMi1zZWNvbmQgc2V0VGltZW91dCgpIHRvIHNlbnNlIGlmL3doZW4gdGhhdCBjb25kaXRpb24gb2NjdXJzIGFuZCB0aGVuIHdha2UoKSB0aGUgdGlja2VyLlxuXHRcdHZhciBfY2hlY2tUaW1lb3V0ID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGlmIChfdGlja2VyQWN0aXZlICYmIF9nZXRUaW1lKCkgLSBfbGFzdFVwZGF0ZSA+IDIwMDApIHtcblx0XHRcdFx0XHRfdGlja2VyLndha2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZXRUaW1lb3V0KF9jaGVja1RpbWVvdXQsIDIwMDApO1xuXHRcdFx0fTtcblx0XHRfY2hlY2tUaW1lb3V0KCk7XG5cblxuXHRcdHAucGxheSA9IGZ1bmN0aW9uKGZyb20sIHN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHRpZiAoZnJvbSAhPSBudWxsKSB7XG5cdFx0XHRcdHRoaXMuc2Vlayhmcm9tLCBzdXBwcmVzc0V2ZW50cyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXZlcnNlZChmYWxzZSkucGF1c2VkKGZhbHNlKTtcblx0XHR9O1xuXG5cdFx0cC5wYXVzZSA9IGZ1bmN0aW9uKGF0VGltZSwgc3VwcHJlc3NFdmVudHMpIHtcblx0XHRcdGlmIChhdFRpbWUgIT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLnNlZWsoYXRUaW1lLCBzdXBwcmVzc0V2ZW50cyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXVzZWQodHJ1ZSk7XG5cdFx0fTtcblxuXHRcdHAucmVzdW1lID0gZnVuY3Rpb24oZnJvbSwgc3VwcHJlc3NFdmVudHMpIHtcblx0XHRcdGlmIChmcm9tICE9IG51bGwpIHtcblx0XHRcdFx0dGhpcy5zZWVrKGZyb20sIHN1cHByZXNzRXZlbnRzKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnBhdXNlZChmYWxzZSk7XG5cdFx0fTtcblxuXHRcdHAuc2VlayA9IGZ1bmN0aW9uKHRpbWUsIHN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50b3RhbFRpbWUoTnVtYmVyKHRpbWUpLCBzdXBwcmVzc0V2ZW50cyAhPT0gZmFsc2UpO1xuXHRcdH07XG5cblx0XHRwLnJlc3RhcnQgPSBmdW5jdGlvbihpbmNsdWRlRGVsYXksIHN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXZlcnNlZChmYWxzZSkucGF1c2VkKGZhbHNlKS50b3RhbFRpbWUoaW5jbHVkZURlbGF5ID8gLXRoaXMuX2RlbGF5IDogMCwgKHN1cHByZXNzRXZlbnRzICE9PSBmYWxzZSksIHRydWUpO1xuXHRcdH07XG5cblx0XHRwLnJldmVyc2UgPSBmdW5jdGlvbihmcm9tLCBzdXBwcmVzc0V2ZW50cykge1xuXHRcdFx0aWYgKGZyb20gIT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLnNlZWsoKGZyb20gfHwgdGhpcy50b3RhbER1cmF0aW9uKCkpLCBzdXBwcmVzc0V2ZW50cyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXZlcnNlZCh0cnVlKS5wYXVzZWQoZmFsc2UpO1xuXHRcdH07XG5cblx0XHRwLnJlbmRlciA9IGZ1bmN0aW9uKHRpbWUsIHN1cHByZXNzRXZlbnRzLCBmb3JjZSkge1xuXHRcdFx0Ly9zdHViIC0gd2Ugb3ZlcnJpZGUgdGhpcyBtZXRob2QgaW4gc3ViY2xhc3Nlcy5cblx0XHR9O1xuXG5cdFx0cC5pbnZhbGlkYXRlID0gZnVuY3Rpb24oKSB7XG5cdFx0XHR0aGlzLl90aW1lID0gdGhpcy5fdG90YWxUaW1lID0gMDtcblx0XHRcdHRoaXMuX2luaXR0ZWQgPSB0aGlzLl9nYyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fcmF3UHJldlRpbWUgPSAtMTtcblx0XHRcdGlmICh0aGlzLl9nYyB8fCAhdGhpcy50aW1lbGluZSkge1xuXHRcdFx0XHR0aGlzLl9lbmFibGVkKHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblxuXHRcdHAuaXNBY3RpdmUgPSBmdW5jdGlvbigpIHtcblx0XHRcdHZhciB0bCA9IHRoaXMuX3RpbWVsaW5lLCAvL3RoZSAyIHJvb3QgdGltZWxpbmVzIHdvbid0IGhhdmUgYSBfdGltZWxpbmU7IHRoZXkncmUgYWx3YXlzIGFjdGl2ZS5cblx0XHRcdFx0c3RhcnRUaW1lID0gdGhpcy5fc3RhcnRUaW1lLFxuXHRcdFx0XHRyYXdUaW1lO1xuXHRcdFx0cmV0dXJuICghdGwgfHwgKCF0aGlzLl9nYyAmJiAhdGhpcy5fcGF1c2VkICYmIHRsLmlzQWN0aXZlKCkgJiYgKHJhd1RpbWUgPSB0bC5yYXdUaW1lKCkpID49IHN0YXJ0VGltZSAmJiByYXdUaW1lIDwgc3RhcnRUaW1lICsgdGhpcy50b3RhbER1cmF0aW9uKCkgLyB0aGlzLl90aW1lU2NhbGUpKTtcblx0XHR9O1xuXG5cdFx0cC5fZW5hYmxlZCA9IGZ1bmN0aW9uIChlbmFibGVkLCBpZ25vcmVUaW1lbGluZSkge1xuXHRcdFx0aWYgKCFfdGlja2VyQWN0aXZlKSB7XG5cdFx0XHRcdF90aWNrZXIud2FrZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZ2MgPSAhZW5hYmxlZDtcblx0XHRcdHRoaXMuX2FjdGl2ZSA9IHRoaXMuaXNBY3RpdmUoKTtcblx0XHRcdGlmIChpZ25vcmVUaW1lbGluZSAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRpZiAoZW5hYmxlZCAmJiAhdGhpcy50aW1lbGluZSkge1xuXHRcdFx0XHRcdHRoaXMuX3RpbWVsaW5lLmFkZCh0aGlzLCB0aGlzLl9zdGFydFRpbWUgLSB0aGlzLl9kZWxheSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWVuYWJsZWQgJiYgdGhpcy50aW1lbGluZSkge1xuXHRcdFx0XHRcdHRoaXMuX3RpbWVsaW5lLl9yZW1vdmUodGhpcywgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cblx0XHRwLl9raWxsID0gZnVuY3Rpb24odmFycywgdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlZChmYWxzZSwgZmFsc2UpO1xuXHRcdH07XG5cblx0XHRwLmtpbGwgPSBmdW5jdGlvbih2YXJzLCB0YXJnZXQpIHtcblx0XHRcdHRoaXMuX2tpbGwodmFycywgdGFyZ2V0KTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cblx0XHRwLl91bmNhY2hlID0gZnVuY3Rpb24oaW5jbHVkZVNlbGYpIHtcblx0XHRcdHZhciB0d2VlbiA9IGluY2x1ZGVTZWxmID8gdGhpcyA6IHRoaXMudGltZWxpbmU7XG5cdFx0XHR3aGlsZSAodHdlZW4pIHtcblx0XHRcdFx0dHdlZW4uX2RpcnR5ID0gdHJ1ZTtcblx0XHRcdFx0dHdlZW4gPSB0d2Vlbi50aW1lbGluZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cblx0XHRwLl9zd2FwU2VsZkluUGFyYW1zID0gZnVuY3Rpb24ocGFyYW1zKSB7XG5cdFx0XHR2YXIgaSA9IHBhcmFtcy5sZW5ndGgsXG5cdFx0XHRcdGNvcHkgPSBwYXJhbXMuY29uY2F0KCk7XG5cdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0aWYgKHBhcmFtc1tpXSA9PT0gXCJ7c2VsZn1cIikge1xuXHRcdFx0XHRcdGNvcHlbaV0gPSB0aGlzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29weTtcblx0XHR9O1xuXG5cdFx0cC5fY2FsbGJhY2sgPSBmdW5jdGlvbih0eXBlKSB7XG5cdFx0XHR2YXIgdiA9IHRoaXMudmFycztcblx0XHRcdHZbdHlwZV0uYXBwbHkodlt0eXBlICsgXCJTY29wZVwiXSB8fCB2LmNhbGxiYWNrU2NvcGUgfHwgdGhpcywgdlt0eXBlICsgXCJQYXJhbXNcIl0gfHwgX2JsYW5rQXJyYXkpO1xuXHRcdH07XG5cbi8vLS0tLUFuaW1hdGlvbiBnZXR0ZXJzL3NldHRlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRcdHAuZXZlbnRDYWxsYmFjayA9IGZ1bmN0aW9uKHR5cGUsIGNhbGxiYWNrLCBwYXJhbXMsIHNjb3BlKSB7XG5cdFx0XHRpZiAoKHR5cGUgfHwgXCJcIikuc3Vic3RyKDAsMikgPT09IFwib25cIikge1xuXHRcdFx0XHR2YXIgdiA9IHRoaXMudmFycztcblx0XHRcdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gdlt0eXBlXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2FsbGJhY2sgPT0gbnVsbCkge1xuXHRcdFx0XHRcdGRlbGV0ZSB2W3R5cGVdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZbdHlwZV0gPSBjYWxsYmFjaztcblx0XHRcdFx0XHR2W3R5cGUgKyBcIlBhcmFtc1wiXSA9IChfaXNBcnJheShwYXJhbXMpICYmIHBhcmFtcy5qb2luKFwiXCIpLmluZGV4T2YoXCJ7c2VsZn1cIikgIT09IC0xKSA/IHRoaXMuX3N3YXBTZWxmSW5QYXJhbXMocGFyYW1zKSA6IHBhcmFtcztcblx0XHRcdFx0XHR2W3R5cGUgKyBcIlNjb3BlXCJdID0gc2NvcGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGUgPT09IFwib25VcGRhdGVcIikge1xuXHRcdFx0XHRcdHRoaXMuX29uVXBkYXRlID0gY2FsbGJhY2s7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cblx0XHRwLmRlbGF5ID0gZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdGlmICghYXJndW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZGVsYXk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fdGltZWxpbmUuc21vb3RoQ2hpbGRUaW1pbmcpIHtcblx0XHRcdFx0dGhpcy5zdGFydFRpbWUoIHRoaXMuX3N0YXJ0VGltZSArIHZhbHVlIC0gdGhpcy5fZGVsYXkgKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RlbGF5ID0gdmFsdWU7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXG5cdFx0cC5kdXJhdGlvbiA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHRpZiAoIWFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fZGlydHkgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2R1cmF0aW9uO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZHVyYXRpb24gPSB0aGlzLl90b3RhbER1cmF0aW9uID0gdmFsdWU7XG5cdFx0XHR0aGlzLl91bmNhY2hlKHRydWUpOyAvL3RydWUgaW4gY2FzZSBpdCdzIGEgVHdlZW5NYXggb3IgVGltZWxpbmVNYXggdGhhdCBoYXMgYSByZXBlYXQgLSB3ZSdsbCBuZWVkIHRvIHJlZnJlc2ggdGhlIHRvdGFsRHVyYXRpb24uXG5cdFx0XHRpZiAodGhpcy5fdGltZWxpbmUuc21vb3RoQ2hpbGRUaW1pbmcpIGlmICh0aGlzLl90aW1lID4gMCkgaWYgKHRoaXMuX3RpbWUgPCB0aGlzLl9kdXJhdGlvbikgaWYgKHZhbHVlICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMudG90YWxUaW1lKHRoaXMuX3RvdGFsVGltZSAqICh2YWx1ZSAvIHRoaXMuX2R1cmF0aW9uKSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXG5cdFx0cC50b3RhbER1cmF0aW9uID0gZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdHRoaXMuX2RpcnR5ID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4gKCFhcmd1bWVudHMubGVuZ3RoKSA/IHRoaXMuX3RvdGFsRHVyYXRpb24gOiB0aGlzLmR1cmF0aW9uKHZhbHVlKTtcblx0XHR9O1xuXG5cdFx0cC50aW1lID0gZnVuY3Rpb24odmFsdWUsIHN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHRpZiAoIWFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3RpbWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fZGlydHkpIHtcblx0XHRcdFx0dGhpcy50b3RhbER1cmF0aW9uKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy50b3RhbFRpbWUoKHZhbHVlID4gdGhpcy5fZHVyYXRpb24pID8gdGhpcy5fZHVyYXRpb24gOiB2YWx1ZSwgc3VwcHJlc3NFdmVudHMpO1xuXHRcdH07XG5cblx0XHRwLnRvdGFsVGltZSA9IGZ1bmN0aW9uKHRpbWUsIHN1cHByZXNzRXZlbnRzLCB1bmNhcHBlZCkge1xuXHRcdFx0aWYgKCFfdGlja2VyQWN0aXZlKSB7XG5cdFx0XHRcdF90aWNrZXIud2FrZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFhcmd1bWVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl90b3RhbFRpbWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fdGltZWxpbmUpIHtcblx0XHRcdFx0aWYgKHRpbWUgPCAwICYmICF1bmNhcHBlZCkge1xuXHRcdFx0XHRcdHRpbWUgKz0gdGhpcy50b3RhbER1cmF0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX3RpbWVsaW5lLnNtb290aENoaWxkVGltaW5nKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2RpcnR5KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRvdGFsRHVyYXRpb24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dmFyIHRvdGFsRHVyYXRpb24gPSB0aGlzLl90b3RhbER1cmF0aW9uLFxuXHRcdFx0XHRcdFx0dGwgPSB0aGlzLl90aW1lbGluZTtcblx0XHRcdFx0XHRpZiAodGltZSA+IHRvdGFsRHVyYXRpb24gJiYgIXVuY2FwcGVkKSB7XG5cdFx0XHRcdFx0XHR0aW1lID0gdG90YWxEdXJhdGlvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fc3RhcnRUaW1lID0gKHRoaXMuX3BhdXNlZCA/IHRoaXMuX3BhdXNlVGltZSA6IHRsLl90aW1lKSAtICgoIXRoaXMuX3JldmVyc2VkID8gdGltZSA6IHRvdGFsRHVyYXRpb24gLSB0aW1lKSAvIHRoaXMuX3RpbWVTY2FsZSk7XG5cdFx0XHRcdFx0aWYgKCF0bC5fZGlydHkpIHsgLy9mb3IgcGVyZm9ybWFuY2UgaW1wcm92ZW1lbnQuIElmIHRoZSBwYXJlbnQncyBjYWNoZSBpcyBhbHJlYWR5IGRpcnR5LCBpdCBhbHJlYWR5IHRvb2sgY2FyZSBvZiBtYXJraW5nIHRoZSBhbmNlc3RvcnMgYXMgZGlydHkgdG9vLCBzbyBza2lwIHRoZSBmdW5jdGlvbiBjYWxsIGhlcmUuXG5cdFx0XHRcdFx0XHR0aGlzLl91bmNhY2hlKGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly9pbiBjYXNlIGFueSBvZiB0aGUgYW5jZXN0b3IgdGltZWxpbmVzIGhhZCBjb21wbGV0ZWQgYnV0IHNob3VsZCBub3cgYmUgZW5hYmxlZCwgd2Ugc2hvdWxkIHJlc2V0IHRoZWlyIHRvdGFsVGltZSgpIHdoaWNoIHdpbGwgYWxzbyBlbnN1cmUgdGhhdCB0aGV5J3JlIGxpbmVkIHVwIHByb3Blcmx5IGFuZCBlbmFibGVkLiBTa2lwIGZvciBhbmltYXRpb25zIHRoYXQgYXJlIG9uIHRoZSByb290ICh3YXN0ZWZ1bCkuIEV4YW1wbGU6IGEgVGltZWxpbmVMaXRlLmV4cG9ydFJvb3QoKSBpcyBwZXJmb3JtZWQgd2hlbiB0aGVyZSdzIGEgcGF1c2VkIHR3ZWVuIG9uIHRoZSByb290LCB0aGUgZXhwb3J0IHdpbGwgbm90IGNvbXBsZXRlIHVudGlsIHRoYXQgdHdlZW4gaXMgdW5wYXVzZWQsIGJ1dCBpbWFnaW5lIGEgY2hpbGQgZ2V0cyByZXN0YXJ0ZWQgbGF0ZXIsIGFmdGVyIGFsbCBbdW5wYXVzZWRdIHR3ZWVucyBoYXZlIGNvbXBsZXRlZC4gVGhlIHN0YXJ0VGltZSBvZiB0aGF0IGNoaWxkIHdvdWxkIGdldCBwdXNoZWQgb3V0LCBidXQgb25lIG9mIHRoZSBhbmNlc3RvcnMgbWF5IGhhdmUgY29tcGxldGVkLlxuXHRcdFx0XHRcdGlmICh0bC5fdGltZWxpbmUpIHtcblx0XHRcdFx0XHRcdHdoaWxlICh0bC5fdGltZWxpbmUpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHRsLl90aW1lbGluZS5fdGltZSAhPT0gKHRsLl9zdGFydFRpbWUgKyB0bC5fdG90YWxUaW1lKSAvIHRsLl90aW1lU2NhbGUpIHtcblx0XHRcdFx0XHRcdFx0XHR0bC50b3RhbFRpbWUodGwuX3RvdGFsVGltZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dGwgPSB0bC5fdGltZWxpbmU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl9nYykge1xuXHRcdFx0XHRcdHRoaXMuX2VuYWJsZWQodHJ1ZSwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl90b3RhbFRpbWUgIT09IHRpbWUgfHwgdGhpcy5fZHVyYXRpb24gPT09IDApIHtcblx0XHRcdFx0XHRpZiAoX2xhenlUd2VlbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRfbGF6eVJlbmRlcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnJlbmRlcih0aW1lLCBzdXBwcmVzc0V2ZW50cywgZmFsc2UpO1xuXHRcdFx0XHRcdGlmIChfbGF6eVR3ZWVucy5sZW5ndGgpIHsgLy9pbiBjYXNlIHJlbmRlcmluZyBjYXVzZWQgYW55IHR3ZWVucyB0byBsYXp5LWluaXQsIHdlIHNob3VsZCByZW5kZXIgdGhlbSBiZWNhdXNlIHR5cGljYWxseSB3aGVuIHNvbWVvbmUgY2FsbHMgc2VlaygpIG9yIHRpbWUoKSBvciBwcm9ncmVzcygpLCB0aGV5IGV4cGVjdCBhbiBpbW1lZGlhdGUgcmVuZGVyLlxuXHRcdFx0XHRcdFx0X2xhenlSZW5kZXIoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cblx0XHRwLnByb2dyZXNzID0gcC50b3RhbFByb2dyZXNzID0gZnVuY3Rpb24odmFsdWUsIHN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHR2YXIgZHVyYXRpb24gPSB0aGlzLmR1cmF0aW9uKCk7XG5cdFx0XHRyZXR1cm4gKCFhcmd1bWVudHMubGVuZ3RoKSA/IChkdXJhdGlvbiA/IHRoaXMuX3RpbWUgLyBkdXJhdGlvbiA6IHRoaXMucmF0aW8pIDogdGhpcy50b3RhbFRpbWUoZHVyYXRpb24gKiB2YWx1ZSwgc3VwcHJlc3NFdmVudHMpO1xuXHRcdH07XG5cblx0XHRwLnN0YXJ0VGltZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHRpZiAoIWFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3N0YXJ0VGltZTtcblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZSAhPT0gdGhpcy5fc3RhcnRUaW1lKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0VGltZSA9IHZhbHVlO1xuXHRcdFx0XHRpZiAodGhpcy50aW1lbGluZSkgaWYgKHRoaXMudGltZWxpbmUuX3NvcnRDaGlsZHJlbikge1xuXHRcdFx0XHRcdHRoaXMudGltZWxpbmUuYWRkKHRoaXMsIHZhbHVlIC0gdGhpcy5fZGVsYXkpOyAvL2Vuc3VyZXMgdGhhdCBhbnkgbmVjZXNzYXJ5IHJlLXNlcXVlbmNpbmcgb2YgQW5pbWF0aW9ucyBpbiB0aGUgdGltZWxpbmUgb2NjdXJzIHRvIG1ha2Ugc3VyZSB0aGUgcmVuZGVyaW5nIG9yZGVyIGlzIGNvcnJlY3QuXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cblx0XHRwLmVuZFRpbWUgPSBmdW5jdGlvbihpbmNsdWRlUmVwZWF0cykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3N0YXJ0VGltZSArICgoaW5jbHVkZVJlcGVhdHMgIT0gZmFsc2UpID8gdGhpcy50b3RhbER1cmF0aW9uKCkgOiB0aGlzLmR1cmF0aW9uKCkpIC8gdGhpcy5fdGltZVNjYWxlO1xuXHRcdH07XG5cblx0XHRwLnRpbWVTY2FsZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHRpZiAoIWFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3RpbWVTY2FsZTtcblx0XHRcdH1cblx0XHRcdHZhbHVlID0gdmFsdWUgfHwgX3RpbnlOdW07IC8vY2FuJ3QgYWxsb3cgemVybyBiZWNhdXNlIGl0J2xsIHRocm93IHRoZSBtYXRoIG9mZlxuXHRcdFx0aWYgKHRoaXMuX3RpbWVsaW5lICYmIHRoaXMuX3RpbWVsaW5lLnNtb290aENoaWxkVGltaW5nKSB7XG5cdFx0XHRcdHZhciBwYXVzZVRpbWUgPSB0aGlzLl9wYXVzZVRpbWUsXG5cdFx0XHRcdFx0dCA9IChwYXVzZVRpbWUgfHwgcGF1c2VUaW1lID09PSAwKSA/IHBhdXNlVGltZSA6IHRoaXMuX3RpbWVsaW5lLnRvdGFsVGltZSgpO1xuXHRcdFx0XHR0aGlzLl9zdGFydFRpbWUgPSB0IC0gKCh0IC0gdGhpcy5fc3RhcnRUaW1lKSAqIHRoaXMuX3RpbWVTY2FsZSAvIHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3RpbWVTY2FsZSA9IHZhbHVlO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3VuY2FjaGUoZmFsc2UpO1xuXHRcdH07XG5cblx0XHRwLnJldmVyc2VkID0gZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdGlmICghYXJndW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmV2ZXJzZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWUgIT0gdGhpcy5fcmV2ZXJzZWQpIHtcblx0XHRcdFx0dGhpcy5fcmV2ZXJzZWQgPSB2YWx1ZTtcblx0XHRcdFx0dGhpcy50b3RhbFRpbWUoKCh0aGlzLl90aW1lbGluZSAmJiAhdGhpcy5fdGltZWxpbmUuc21vb3RoQ2hpbGRUaW1pbmcpID8gdGhpcy50b3RhbER1cmF0aW9uKCkgLSB0aGlzLl90b3RhbFRpbWUgOiB0aGlzLl90b3RhbFRpbWUpLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cblx0XHRwLnBhdXNlZCA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHRpZiAoIWFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3BhdXNlZDtcblx0XHRcdH1cblx0XHRcdHZhciB0bCA9IHRoaXMuX3RpbWVsaW5lLFxuXHRcdFx0XHRyYXcsIGVsYXBzZWQ7XG5cdFx0XHRpZiAodmFsdWUgIT0gdGhpcy5fcGF1c2VkKSBpZiAodGwpIHtcblx0XHRcdFx0aWYgKCFfdGlja2VyQWN0aXZlICYmICF2YWx1ZSkge1xuXHRcdFx0XHRcdF90aWNrZXIud2FrZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJhdyA9IHRsLnJhd1RpbWUoKTtcblx0XHRcdFx0ZWxhcHNlZCA9IHJhdyAtIHRoaXMuX3BhdXNlVGltZTtcblx0XHRcdFx0aWYgKCF2YWx1ZSAmJiB0bC5zbW9vdGhDaGlsZFRpbWluZykge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0VGltZSArPSBlbGFwc2VkO1xuXHRcdFx0XHRcdHRoaXMuX3VuY2FjaGUoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3BhdXNlVGltZSA9IHZhbHVlID8gcmF3IDogbnVsbDtcblx0XHRcdFx0dGhpcy5fcGF1c2VkID0gdmFsdWU7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZSA9IHRoaXMuaXNBY3RpdmUoKTtcblx0XHRcdFx0aWYgKCF2YWx1ZSAmJiBlbGFwc2VkICE9PSAwICYmIHRoaXMuX2luaXR0ZWQgJiYgdGhpcy5kdXJhdGlvbigpKSB7XG5cdFx0XHRcdFx0cmF3ID0gdGwuc21vb3RoQ2hpbGRUaW1pbmcgPyB0aGlzLl90b3RhbFRpbWUgOiAocmF3IC0gdGhpcy5fc3RhcnRUaW1lKSAvIHRoaXMuX3RpbWVTY2FsZTtcblx0XHRcdFx0XHR0aGlzLnJlbmRlcihyYXcsIChyYXcgPT09IHRoaXMuX3RvdGFsVGltZSksIHRydWUpOyAvL2luIGNhc2UgdGhlIHRhcmdldCdzIHByb3BlcnRpZXMgY2hhbmdlZCB2aWEgc29tZSBvdGhlciB0d2VlbiBvciBtYW51YWwgdXBkYXRlIGJ5IHRoZSB1c2VyLCB3ZSBzaG91bGQgZm9yY2UgYSByZW5kZXIuXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9nYyAmJiAhdmFsdWUpIHtcblx0XHRcdFx0dGhpcy5fZW5hYmxlZCh0cnVlLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXG5cbi8qXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBTaW1wbGVUaW1lbGluZVxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICovXG5cdFx0dmFyIFNpbXBsZVRpbWVsaW5lID0gX2NsYXNzKFwiY29yZS5TaW1wbGVUaW1lbGluZVwiLCBmdW5jdGlvbih2YXJzKSB7XG5cdFx0XHRBbmltYXRpb24uY2FsbCh0aGlzLCAwLCB2YXJzKTtcblx0XHRcdHRoaXMuYXV0b1JlbW92ZUNoaWxkcmVuID0gdGhpcy5zbW9vdGhDaGlsZFRpbWluZyA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRwID0gU2ltcGxlVGltZWxpbmUucHJvdG90eXBlID0gbmV3IEFuaW1hdGlvbigpO1xuXHRcdHAuY29uc3RydWN0b3IgPSBTaW1wbGVUaW1lbGluZTtcblx0XHRwLmtpbGwoKS5fZ2MgPSBmYWxzZTtcblx0XHRwLl9maXJzdCA9IHAuX2xhc3QgPSBwLl9yZWNlbnQgPSBudWxsO1xuXHRcdHAuX3NvcnRDaGlsZHJlbiA9IGZhbHNlO1xuXG5cdFx0cC5hZGQgPSBwLmluc2VydCA9IGZ1bmN0aW9uKGNoaWxkLCBwb3NpdGlvbiwgYWxpZ24sIHN0YWdnZXIpIHtcblx0XHRcdHZhciBwcmV2VHdlZW4sIHN0O1xuXHRcdFx0Y2hpbGQuX3N0YXJ0VGltZSA9IE51bWJlcihwb3NpdGlvbiB8fCAwKSArIGNoaWxkLl9kZWxheTtcblx0XHRcdGlmIChjaGlsZC5fcGF1c2VkKSBpZiAodGhpcyAhPT0gY2hpbGQuX3RpbWVsaW5lKSB7IC8vd2Ugb25seSBhZGp1c3QgdGhlIF9wYXVzZVRpbWUgaWYgaXQgd2Fzbid0IGluIHRoaXMgdGltZWxpbmUgYWxyZWFkeS4gUmVtZW1iZXIsIHNvbWV0aW1lcyBhIHR3ZWVuIHdpbGwgYmUgaW5zZXJ0ZWQgYWdhaW4gaW50byB0aGUgc2FtZSB0aW1lbGluZSB3aGVuIGl0cyBzdGFydFRpbWUgaXMgY2hhbmdlZCBzbyB0aGF0IHRoZSB0d2VlbnMgaW4gdGhlIFRpbWVsaW5lTGl0ZS9NYXggYXJlIHJlLW9yZGVyZWQgcHJvcGVybHkgaW4gdGhlIGxpbmtlZCBsaXN0IChzbyBldmVyeXRoaW5nIHJlbmRlcnMgaW4gdGhlIHByb3BlciBvcmRlcikuXG5cdFx0XHRcdGNoaWxkLl9wYXVzZVRpbWUgPSBjaGlsZC5fc3RhcnRUaW1lICsgKCh0aGlzLnJhd1RpbWUoKSAtIGNoaWxkLl9zdGFydFRpbWUpIC8gY2hpbGQuX3RpbWVTY2FsZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hpbGQudGltZWxpbmUpIHtcblx0XHRcdFx0Y2hpbGQudGltZWxpbmUuX3JlbW92ZShjaGlsZCwgdHJ1ZSk7IC8vcmVtb3ZlcyBmcm9tIGV4aXN0aW5nIHRpbWVsaW5lIHNvIHRoYXQgaXQgY2FuIGJlIHByb3Blcmx5IGFkZGVkIHRvIHRoaXMgb25lLlxuXHRcdFx0fVxuXHRcdFx0Y2hpbGQudGltZWxpbmUgPSBjaGlsZC5fdGltZWxpbmUgPSB0aGlzO1xuXHRcdFx0aWYgKGNoaWxkLl9nYykge1xuXHRcdFx0XHRjaGlsZC5fZW5hYmxlZCh0cnVlLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdHByZXZUd2VlbiA9IHRoaXMuX2xhc3Q7XG5cdFx0XHRpZiAodGhpcy5fc29ydENoaWxkcmVuKSB7XG5cdFx0XHRcdHN0ID0gY2hpbGQuX3N0YXJ0VGltZTtcblx0XHRcdFx0d2hpbGUgKHByZXZUd2VlbiAmJiBwcmV2VHdlZW4uX3N0YXJ0VGltZSA+IHN0KSB7XG5cdFx0XHRcdFx0cHJldlR3ZWVuID0gcHJldlR3ZWVuLl9wcmV2O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJldlR3ZWVuKSB7XG5cdFx0XHRcdGNoaWxkLl9uZXh0ID0gcHJldlR3ZWVuLl9uZXh0O1xuXHRcdFx0XHRwcmV2VHdlZW4uX25leHQgPSBjaGlsZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNoaWxkLl9uZXh0ID0gdGhpcy5fZmlyc3Q7XG5cdFx0XHRcdHRoaXMuX2ZpcnN0ID0gY2hpbGQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hpbGQuX25leHQpIHtcblx0XHRcdFx0Y2hpbGQuX25leHQuX3ByZXYgPSBjaGlsZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xhc3QgPSBjaGlsZDtcblx0XHRcdH1cblx0XHRcdGNoaWxkLl9wcmV2ID0gcHJldlR3ZWVuO1xuXHRcdFx0dGhpcy5fcmVjZW50ID0gY2hpbGQ7XG5cdFx0XHRpZiAodGhpcy5fdGltZWxpbmUpIHtcblx0XHRcdFx0dGhpcy5fdW5jYWNoZSh0cnVlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cblx0XHRwLl9yZW1vdmUgPSBmdW5jdGlvbih0d2Vlbiwgc2tpcERpc2FibGUpIHtcblx0XHRcdGlmICh0d2Vlbi50aW1lbGluZSA9PT0gdGhpcykge1xuXHRcdFx0XHRpZiAoIXNraXBEaXNhYmxlKSB7XG5cdFx0XHRcdFx0dHdlZW4uX2VuYWJsZWQoZmFsc2UsIHRydWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHR3ZWVuLl9wcmV2KSB7XG5cdFx0XHRcdFx0dHdlZW4uX3ByZXYuX25leHQgPSB0d2Vlbi5fbmV4dDtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9maXJzdCA9PT0gdHdlZW4pIHtcblx0XHRcdFx0XHR0aGlzLl9maXJzdCA9IHR3ZWVuLl9uZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0d2Vlbi5fbmV4dCkge1xuXHRcdFx0XHRcdHR3ZWVuLl9uZXh0Ll9wcmV2ID0gdHdlZW4uX3ByZXY7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fbGFzdCA9PT0gdHdlZW4pIHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0ID0gdHdlZW4uX3ByZXY7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHdlZW4uX25leHQgPSB0d2Vlbi5fcHJldiA9IHR3ZWVuLnRpbWVsaW5lID0gbnVsbDtcblx0XHRcdFx0aWYgKHR3ZWVuID09PSB0aGlzLl9yZWNlbnQpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWNlbnQgPSB0aGlzLl9sYXN0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX3RpbWVsaW5lKSB7XG5cdFx0XHRcdFx0dGhpcy5fdW5jYWNoZSh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblxuXHRcdHAucmVuZGVyID0gZnVuY3Rpb24odGltZSwgc3VwcHJlc3NFdmVudHMsIGZvcmNlKSB7XG5cdFx0XHR2YXIgdHdlZW4gPSB0aGlzLl9maXJzdCxcblx0XHRcdFx0bmV4dDtcblx0XHRcdHRoaXMuX3RvdGFsVGltZSA9IHRoaXMuX3RpbWUgPSB0aGlzLl9yYXdQcmV2VGltZSA9IHRpbWU7XG5cdFx0XHR3aGlsZSAodHdlZW4pIHtcblx0XHRcdFx0bmV4dCA9IHR3ZWVuLl9uZXh0OyAvL3JlY29yZCBpdCBoZXJlIGJlY2F1c2UgdGhlIHZhbHVlIGNvdWxkIGNoYW5nZSBhZnRlciByZW5kZXJpbmcuLi5cblx0XHRcdFx0aWYgKHR3ZWVuLl9hY3RpdmUgfHwgKHRpbWUgPj0gdHdlZW4uX3N0YXJ0VGltZSAmJiAhdHdlZW4uX3BhdXNlZCkpIHtcblx0XHRcdFx0XHRpZiAoIXR3ZWVuLl9yZXZlcnNlZCkge1xuXHRcdFx0XHRcdFx0dHdlZW4ucmVuZGVyKCh0aW1lIC0gdHdlZW4uX3N0YXJ0VGltZSkgKiB0d2Vlbi5fdGltZVNjYWxlLCBzdXBwcmVzc0V2ZW50cywgZm9yY2UpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0d2Vlbi5yZW5kZXIoKCghdHdlZW4uX2RpcnR5KSA/IHR3ZWVuLl90b3RhbER1cmF0aW9uIDogdHdlZW4udG90YWxEdXJhdGlvbigpKSAtICgodGltZSAtIHR3ZWVuLl9zdGFydFRpbWUpICogdHdlZW4uX3RpbWVTY2FsZSksIHN1cHByZXNzRXZlbnRzLCBmb3JjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHR3ZWVuID0gbmV4dDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cC5yYXdUaW1lID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRpZiAoIV90aWNrZXJBY3RpdmUpIHtcblx0XHRcdFx0X3RpY2tlci53YWtlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG90YWxUaW1lO1xuXHRcdH07XG5cbi8qXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiBUd2VlbkxpdGVcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqL1xuXHRcdHZhciBUd2VlbkxpdGUgPSBfY2xhc3MoXCJUd2VlbkxpdGVcIiwgZnVuY3Rpb24odGFyZ2V0LCBkdXJhdGlvbiwgdmFycykge1xuXHRcdFx0XHRBbmltYXRpb24uY2FsbCh0aGlzLCBkdXJhdGlvbiwgdmFycyk7XG5cdFx0XHRcdHRoaXMucmVuZGVyID0gVHdlZW5MaXRlLnByb3RvdHlwZS5yZW5kZXI7IC8vc3BlZWQgb3B0aW1pemF0aW9uIChhdm9pZCBwcm90b3R5cGUgbG9va3VwIG9uIHRoaXMgXCJob3RcIiBtZXRob2QpXG5cblx0XHRcdFx0aWYgKHRhcmdldCA9PSBudWxsKSB7XG5cdFx0XHRcdFx0dGhyb3cgXCJDYW5ub3QgdHdlZW4gYSBudWxsIHRhcmdldC5cIjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudGFyZ2V0ID0gdGFyZ2V0ID0gKHR5cGVvZih0YXJnZXQpICE9PSBcInN0cmluZ1wiKSA/IHRhcmdldCA6IFR3ZWVuTGl0ZS5zZWxlY3Rvcih0YXJnZXQpIHx8IHRhcmdldDtcblxuXHRcdFx0XHR2YXIgaXNTZWxlY3RvciA9ICh0YXJnZXQuanF1ZXJ5IHx8ICh0YXJnZXQubGVuZ3RoICYmIHRhcmdldCAhPT0gd2luZG93ICYmIHRhcmdldFswXSAmJiAodGFyZ2V0WzBdID09PSB3aW5kb3cgfHwgKHRhcmdldFswXS5ub2RlVHlwZSAmJiB0YXJnZXRbMF0uc3R5bGUgJiYgIXRhcmdldC5ub2RlVHlwZSkpKSksXG5cdFx0XHRcdFx0b3ZlcndyaXRlID0gdGhpcy52YXJzLm92ZXJ3cml0ZSxcblx0XHRcdFx0XHRpLCB0YXJnLCB0YXJnZXRzO1xuXG5cdFx0XHRcdHRoaXMuX292ZXJ3cml0ZSA9IG92ZXJ3cml0ZSA9IChvdmVyd3JpdGUgPT0gbnVsbCkgPyBfb3ZlcndyaXRlTG9va3VwW1R3ZWVuTGl0ZS5kZWZhdWx0T3ZlcndyaXRlXSA6ICh0eXBlb2Yob3ZlcndyaXRlKSA9PT0gXCJudW1iZXJcIikgPyBvdmVyd3JpdGUgPj4gMCA6IF9vdmVyd3JpdGVMb29rdXBbb3ZlcndyaXRlXTtcblxuXHRcdFx0XHRpZiAoKGlzU2VsZWN0b3IgfHwgdGFyZ2V0IGluc3RhbmNlb2YgQXJyYXkgfHwgKHRhcmdldC5wdXNoICYmIF9pc0FycmF5KHRhcmdldCkpKSAmJiB0eXBlb2YodGFyZ2V0WzBdKSAhPT0gXCJudW1iZXJcIikge1xuXHRcdFx0XHRcdHRoaXMuX3RhcmdldHMgPSB0YXJnZXRzID0gX3NsaWNlKHRhcmdldCk7ICAvL2Rvbid0IHVzZSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0YXJnZXQsIDApIGJlY2F1c2UgdGhhdCBkb2Vzbid0IHdvcmsgaW4gSUU4IHdpdGggYSBOb2RlTGlzdCB0aGF0J3MgcmV0dXJuZWQgYnkgcXVlcnlTZWxlY3RvckFsbCgpXG5cdFx0XHRcdFx0dGhpcy5fcHJvcExvb2t1cCA9IFtdO1xuXHRcdFx0XHRcdHRoaXMuX3NpYmxpbmdzID0gW107XG5cdFx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IHRhcmdldHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdHRhcmcgPSB0YXJnZXRzW2ldO1xuXHRcdFx0XHRcdFx0aWYgKCF0YXJnKSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldHMuc3BsaWNlKGktLSwgMSk7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YodGFyZykgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdFx0XHRcdFx0dGFyZyA9IHRhcmdldHNbaS0tXSA9IFR3ZWVuTGl0ZS5zZWxlY3Rvcih0YXJnKTsgLy9pbiBjYXNlIGl0J3MgYW4gYXJyYXkgb2Ygc3RyaW5nc1xuXHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mKHRhcmcpID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGFyZ2V0cy5zcGxpY2UoaSsxLCAxKTsgLy90byBhdm9pZCBhbiBlbmRsZXNzIGxvb3AgKGNhbid0IGltYWdpbmUgd2h5IHRoZSBzZWxlY3RvciB3b3VsZCByZXR1cm4gYSBzdHJpbmcsIGJ1dCBqdXN0IGluIGNhc2UpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHRhcmcubGVuZ3RoICYmIHRhcmcgIT09IHdpbmRvdyAmJiB0YXJnWzBdICYmICh0YXJnWzBdID09PSB3aW5kb3cgfHwgKHRhcmdbMF0ubm9kZVR5cGUgJiYgdGFyZ1swXS5zdHlsZSAmJiAhdGFyZy5ub2RlVHlwZSkpKSB7IC8vaW4gY2FzZSB0aGUgdXNlciBpcyBwYXNzaW5nIGluIGFuIGFycmF5IG9mIHNlbGVjdG9yIG9iamVjdHMgKGxpa2UgalF1ZXJ5IG9iamVjdHMpLCB3ZSBuZWVkIHRvIGNoZWNrIG9uZSBtb3JlIGxldmVsIGFuZCBwdWxsIHRoaW5ncyBvdXQgaWYgbmVjZXNzYXJ5LiBBbHNvIG5vdGUgdGhhdCA8c2VsZWN0PiBlbGVtZW50cyBwYXNzIGFsbCB0aGUgY3JpdGVyaWEgcmVnYXJkaW5nIGxlbmd0aCBhbmQgdGhlIGZpcnN0IGNoaWxkIGhhdmluZyBzdHlsZSwgc28gd2UgbXVzdCBhbHNvIGNoZWNrIHRvIGVuc3VyZSB0aGUgdGFyZ2V0IGlzbid0IGFuIEhUTUwgbm9kZSBpdHNlbGYuXG5cdFx0XHRcdFx0XHRcdHRhcmdldHMuc3BsaWNlKGktLSwgMSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3RhcmdldHMgPSB0YXJnZXRzID0gdGFyZ2V0cy5jb25jYXQoX3NsaWNlKHRhcmcpKTtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLl9zaWJsaW5nc1tpXSA9IF9yZWdpc3Rlcih0YXJnLCB0aGlzLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRpZiAob3ZlcndyaXRlID09PSAxKSBpZiAodGhpcy5fc2libGluZ3NbaV0ubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdFx0XHRfYXBwbHlPdmVyd3JpdGUodGFyZywgdGhpcywgbnVsbCwgMSwgdGhpcy5fc2libGluZ3NbaV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3BMb29rdXAgPSB7fTtcblx0XHRcdFx0XHR0aGlzLl9zaWJsaW5ncyA9IF9yZWdpc3Rlcih0YXJnZXQsIHRoaXMsIGZhbHNlKTtcblx0XHRcdFx0XHRpZiAob3ZlcndyaXRlID09PSAxKSBpZiAodGhpcy5fc2libGluZ3MubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdFx0X2FwcGx5T3ZlcndyaXRlKHRhcmdldCwgdGhpcywgbnVsbCwgMSwgdGhpcy5fc2libGluZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy52YXJzLmltbWVkaWF0ZVJlbmRlciB8fCAoZHVyYXRpb24gPT09IDAgJiYgdGhpcy5fZGVsYXkgPT09IDAgJiYgdGhpcy52YXJzLmltbWVkaWF0ZVJlbmRlciAhPT0gZmFsc2UpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGltZSA9IC1fdGlueU51bTsgLy9mb3JjZXMgYSByZW5kZXIgd2l0aG91dCBoYXZpbmcgdG8gc2V0IHRoZSByZW5kZXIoKSBcImZvcmNlXCIgcGFyYW1ldGVyIHRvIHRydWUgYmVjYXVzZSB3ZSB3YW50IHRvIGFsbG93IGxhenlpbmcgYnkgZGVmYXVsdCAodXNpbmcgdGhlIFwiZm9yY2VcIiBwYXJhbWV0ZXIgYWx3YXlzIGZvcmNlcyBhbiBpbW1lZGlhdGUgZnVsbCByZW5kZXIpXG5cdFx0XHRcdFx0dGhpcy5yZW5kZXIoLXRoaXMuX2RlbGF5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdHJ1ZSksXG5cdFx0XHRfaXNTZWxlY3RvciA9IGZ1bmN0aW9uKHYpIHtcblx0XHRcdFx0cmV0dXJuICh2ICYmIHYubGVuZ3RoICYmIHYgIT09IHdpbmRvdyAmJiB2WzBdICYmICh2WzBdID09PSB3aW5kb3cgfHwgKHZbMF0ubm9kZVR5cGUgJiYgdlswXS5zdHlsZSAmJiAhdi5ub2RlVHlwZSkpKTsgLy93ZSBjYW5ub3QgY2hlY2sgXCJub2RlVHlwZVwiIGlmIHRoZSB0YXJnZXQgaXMgd2luZG93IGZyb20gd2l0aGluIGFuIGlmcmFtZSwgb3RoZXJ3aXNlIGl0IHdpbGwgdHJpZ2dlciBhIHNlY3VyaXR5IGVycm9yIGluIHNvbWUgYnJvd3NlcnMgbGlrZSBGaXJlZm94LlxuXHRcdFx0fSxcblx0XHRcdF9hdXRvQ1NTID0gZnVuY3Rpb24odmFycywgdGFyZ2V0KSB7XG5cdFx0XHRcdHZhciBjc3MgPSB7fSxcblx0XHRcdFx0XHRwO1xuXHRcdFx0XHRmb3IgKHAgaW4gdmFycykge1xuXHRcdFx0XHRcdGlmICghX3Jlc2VydmVkUHJvcHNbcF0gJiYgKCEocCBpbiB0YXJnZXQpIHx8IHAgPT09IFwidHJhbnNmb3JtXCIgfHwgcCA9PT0gXCJ4XCIgfHwgcCA9PT0gXCJ5XCIgfHwgcCA9PT0gXCJ3aWR0aFwiIHx8IHAgPT09IFwiaGVpZ2h0XCIgfHwgcCA9PT0gXCJjbGFzc05hbWVcIiB8fCBwID09PSBcImJvcmRlclwiKSAmJiAoIV9wbHVnaW5zW3BdIHx8IChfcGx1Z2luc1twXSAmJiBfcGx1Z2luc1twXS5fYXV0b0NTUykpKSB7IC8vbm90ZTogPGltZz4gZWxlbWVudHMgY29udGFpbiByZWFkLW9ubHkgXCJ4XCIgYW5kIFwieVwiIHByb3BlcnRpZXMuIFdlIHNob3VsZCBhbHNvIHByaW9yaXRpemUgZWRpdGluZyBjc3Mgd2lkdGgvaGVpZ2h0IHJhdGhlciB0aGFuIHRoZSBlbGVtZW50J3MgcHJvcGVydGllcy5cblx0XHRcdFx0XHRcdGNzc1twXSA9IHZhcnNbcF07XG5cdFx0XHRcdFx0XHRkZWxldGUgdmFyc1twXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dmFycy5jc3MgPSBjc3M7XG5cdFx0XHR9O1xuXG5cdFx0cCA9IFR3ZWVuTGl0ZS5wcm90b3R5cGUgPSBuZXcgQW5pbWF0aW9uKCk7XG5cdFx0cC5jb25zdHJ1Y3RvciA9IFR3ZWVuTGl0ZTtcblx0XHRwLmtpbGwoKS5fZ2MgPSBmYWxzZTtcblxuLy8tLS0tVHdlZW5MaXRlIGRlZmF1bHRzLCBvdmVyd3JpdGUgbWFuYWdlbWVudCwgYW5kIHJvb3QgdXBkYXRlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0XHRwLnJhdGlvID0gMDtcblx0XHRwLl9maXJzdFBUID0gcC5fdGFyZ2V0cyA9IHAuX292ZXJ3cml0dGVuUHJvcHMgPSBwLl9zdGFydEF0ID0gbnVsbDtcblx0XHRwLl9ub3RpZnlQbHVnaW5zT2ZFbmFibGVkID0gcC5fbGF6eSA9IGZhbHNlO1xuXG5cdFx0VHdlZW5MaXRlLnZlcnNpb24gPSBcIjEuMTguMFwiO1xuXHRcdFR3ZWVuTGl0ZS5kZWZhdWx0RWFzZSA9IHAuX2Vhc2UgPSBuZXcgRWFzZShudWxsLCBudWxsLCAxLCAxKTtcblx0XHRUd2VlbkxpdGUuZGVmYXVsdE92ZXJ3cml0ZSA9IFwiYXV0b1wiO1xuXHRcdFR3ZWVuTGl0ZS50aWNrZXIgPSBfdGlja2VyO1xuXHRcdFR3ZWVuTGl0ZS5hdXRvU2xlZXAgPSAxMjA7XG5cdFx0VHdlZW5MaXRlLmxhZ1Ntb290aGluZyA9IGZ1bmN0aW9uKHRocmVzaG9sZCwgYWRqdXN0ZWRMYWcpIHtcblx0XHRcdF90aWNrZXIubGFnU21vb3RoaW5nKHRocmVzaG9sZCwgYWRqdXN0ZWRMYWcpO1xuXHRcdH07XG5cblx0XHRUd2VlbkxpdGUuc2VsZWN0b3IgPSB3aW5kb3cuJCB8fCB3aW5kb3cualF1ZXJ5IHx8IGZ1bmN0aW9uKGUpIHtcblx0XHRcdHZhciBzZWxlY3RvciA9IHdpbmRvdy4kIHx8IHdpbmRvdy5qUXVlcnk7XG5cdFx0XHRpZiAoc2VsZWN0b3IpIHtcblx0XHRcdFx0VHdlZW5MaXRlLnNlbGVjdG9yID0gc2VsZWN0b3I7XG5cdFx0XHRcdHJldHVybiBzZWxlY3RvcihlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAodHlwZW9mKGRvY3VtZW50KSA9PT0gXCJ1bmRlZmluZWRcIikgPyBlIDogKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwgPyBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGUpIDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoKGUuY2hhckF0KDApID09PSBcIiNcIikgPyBlLnN1YnN0cigxKSA6IGUpKTtcblx0XHR9O1xuXG5cdFx0dmFyIF9sYXp5VHdlZW5zID0gW10sXG5cdFx0XHRfbGF6eUxvb2t1cCA9IHt9LFxuXHRcdFx0X251bWJlcnNFeHAgPSAvKD86KC18LT18XFwrPSk/XFxkKlxcLj9cXGQqKD86ZVtcXC0rXT9cXGQrKT8pWzAtOV0vaWcsXG5cdFx0XHQvL19ub25OdW1iZXJzRXhwID0gLyg/OihbXFwtK10oPyEoXFxkfD0pKSl8W15cXGRcXC0rPWVdfChlKD8hW1xcLStdW1xcZF0pKSkrL2lnLFxuXHRcdFx0X3NldFJhdGlvID0gZnVuY3Rpb24odikge1xuXHRcdFx0XHR2YXIgcHQgPSB0aGlzLl9maXJzdFBULFxuXHRcdFx0XHRcdG1pbiA9IDAuMDAwMDAxLFxuXHRcdFx0XHRcdHZhbDtcblx0XHRcdFx0d2hpbGUgKHB0KSB7XG5cdFx0XHRcdFx0dmFsID0gIXB0LmJsb2IgPyBwdC5jICogdiArIHB0LnMgOiB2ID8gdGhpcy5qb2luKFwiXCIpIDogdGhpcy5zdGFydDtcblx0XHRcdFx0XHRpZiAocHQucikge1xuXHRcdFx0XHRcdFx0dmFsID0gTWF0aC5yb3VuZCh2YWwpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodmFsIDwgbWluKSBpZiAodmFsID4gLW1pbikgeyAvL3ByZXZlbnRzIGlzc3VlcyB3aXRoIGNvbnZlcnRpbmcgdmVyeSBzbWFsbCBudW1iZXJzIHRvIHN0cmluZ3MgaW4gdGhlIGJyb3dzZXJcblx0XHRcdFx0XHRcdHZhbCA9IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghcHQuZikge1xuXHRcdFx0XHRcdFx0cHQudFtwdC5wXSA9IHZhbDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHB0LmZwKSB7XG5cdFx0XHRcdFx0XHRwdC50W3B0LnBdKHB0LmZwLCB2YWwpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRwdC50W3B0LnBdKHZhbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHB0ID0gcHQuX25leHQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQvL2NvbXBhcmVzIHR3byBzdHJpbmdzIChzdGFydC9lbmQpLCBmaW5kcyB0aGUgbnVtYmVycyB0aGF0IGFyZSBkaWZmZXJlbnQgYW5kIHNwaXRzIGJhY2sgYW4gYXJyYXkgcmVwcmVzZW50aW5nIHRoZSB3aG9sZSB2YWx1ZSBidXQgd2l0aCB0aGUgY2hhbmdpbmcgdmFsdWVzIGlzb2xhdGVkIGFzIGVsZW1lbnRzLiBGb3IgZXhhbXBsZSwgXCJyZ2IoMCwwLDApXCIgYW5kIFwicmdiKDEwMCw1MCwwKVwiIHdvdWxkIGJlY29tZSBbXCJyZ2IoXCIsIDAsIFwiLFwiLCA1MCwgXCIsMClcIl0uIE5vdGljZSBpdCBtZXJnZXMgdGhlIHBhcnRzIHRoYXQgYXJlIGlkZW50aWNhbCAocGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uKS4gVGhlIGFycmF5IGFsc28gaGFzIGEgbGlua2VkIGxpc3Qgb2YgUHJvcFR3ZWVucyBhdHRhY2hlZCBzdGFydGluZyB3aXRoIF9maXJzdFBUIHRoYXQgY29udGFpbiB0aGUgdHdlZW5pbmcgZGF0YSAodCwgcCwgcywgYywgZiwgZXRjLikuIEl0IGFsc28gc3RvcmVzIHRoZSBzdGFydGluZyB2YWx1ZSBhcyBhIFwic3RhcnRcIiBwcm9wZXJ0eSBzbyB0aGF0IHdlIGNhbiByZXZlcnQgdG8gaXQgaWYvd2hlbiBuZWNlc3NhcnksIGxpa2Ugd2hlbiBhIHR3ZWVuIHJld2luZHMgZnVsbHkuIElmIHRoZSBxdWFudGl0eSBvZiBudW1iZXJzIGRpZmZlcnMgYmV0d2VlbiB0aGUgc3RhcnQgYW5kIGVuZCwgaXQgd2lsbCBhbHdheXMgcHJpb3JpdGl6ZSB0aGUgZW5kIHZhbHVlKHMpLiBUaGUgcHQgcGFyYW1ldGVyIGlzIG9wdGlvbmFsIC0gaXQncyBmb3IgYSBQcm9wVHdlZW4gdGhhdCB3aWxsIGJlIGFwcGVuZGVkIHRvIHRoZSBlbmQgb2YgdGhlIGxpbmtlZCBsaXN0IGFuZCBpcyB0eXBpY2FsbHkgZm9yIGFjdHVhbGx5IHNldHRpbmcgdGhlIHZhbHVlIGFmdGVyIGFsbCBvZiB0aGUgZWxlbWVudHMgaGF2ZSBiZWVuIHVwZGF0ZWQgKHdpdGggYXJyYXkuam9pbihcIlwiKSkuXG5cdFx0XHRfYmxvYkRpZiA9IGZ1bmN0aW9uKHN0YXJ0LCBlbmQsIGZpbHRlciwgcHQpIHtcblx0XHRcdFx0dmFyIGEgPSBbc3RhcnQsIGVuZF0sXG5cdFx0XHRcdFx0Y2hhckluZGV4ID0gMCxcblx0XHRcdFx0XHRzID0gXCJcIixcblx0XHRcdFx0XHRjb2xvciA9IDAsXG5cdFx0XHRcdFx0c3RhcnROdW1zLCBlbmROdW1zLCBudW0sIGksIGwsIG5vbk51bWJlcnMsIGN1cnJlbnROdW07XG5cdFx0XHRcdGEuc3RhcnQgPSBzdGFydDtcblx0XHRcdFx0aWYgKGZpbHRlcikge1xuXHRcdFx0XHRcdGZpbHRlcihhKTsgLy9wYXNzIGFuIGFycmF5IHdpdGggdGhlIHN0YXJ0aW5nIGFuZCBlbmRpbmcgdmFsdWVzIGFuZCBsZXQgdGhlIGZpbHRlciBkbyB3aGF0ZXZlciBpdCBuZWVkcyB0byB0aGUgdmFsdWVzLlxuXHRcdFx0XHRcdHN0YXJ0ID0gYVswXTtcblx0XHRcdFx0XHRlbmQgPSBhWzFdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGEubGVuZ3RoID0gMDtcblx0XHRcdFx0c3RhcnROdW1zID0gc3RhcnQubWF0Y2goX251bWJlcnNFeHApIHx8IFtdO1xuXHRcdFx0XHRlbmROdW1zID0gZW5kLm1hdGNoKF9udW1iZXJzRXhwKSB8fCBbXTtcblx0XHRcdFx0aWYgKHB0KSB7XG5cdFx0XHRcdFx0cHQuX25leHQgPSBudWxsO1xuXHRcdFx0XHRcdHB0LmJsb2IgPSAxO1xuXHRcdFx0XHRcdGEuX2ZpcnN0UFQgPSBwdDsgLy9hcHBseSBsYXN0IGluIHRoZSBsaW5rZWQgbGlzdCAod2hpY2ggbWVhbnMgaW5zZXJ0aW5nIGl0IGZpcnN0KVxuXHRcdFx0XHR9XG5cdFx0XHRcdGwgPSBlbmROdW1zLmxlbmd0aDtcblx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuXHRcdFx0XHRcdGN1cnJlbnROdW0gPSBlbmROdW1zW2ldO1xuXHRcdFx0XHRcdG5vbk51bWJlcnMgPSBlbmQuc3Vic3RyKGNoYXJJbmRleCwgZW5kLmluZGV4T2YoY3VycmVudE51bSwgY2hhckluZGV4KS1jaGFySW5kZXgpO1xuXHRcdFx0XHRcdHMgKz0gKG5vbk51bWJlcnMgfHwgIWkpID8gbm9uTnVtYmVycyA6IFwiLFwiOyAvL25vdGU6IFNWRyBzcGVjIGFsbG93cyBvbWlzc2lvbiBvZiBjb21tYS9zcGFjZSB3aGVuIGEgbmVnYXRpdmUgc2lnbiBpcyB3ZWRnZWQgYmV0d2VlbiB0d28gbnVtYmVycywgbGlrZSAyLjUtNS4zIGluc3RlYWQgb2YgMi41LC01LjMgYnV0IHdoZW4gdHdlZW5pbmcsIHRoZSBuZWdhdGl2ZSB2YWx1ZSBtYXkgc3dpdGNoIHRvIHBvc2l0aXZlLCBzbyB3ZSBpbnNlcnQgdGhlIGNvbW1hIGp1c3QgaW4gY2FzZS5cblx0XHRcdFx0XHRjaGFySW5kZXggKz0gbm9uTnVtYmVycy5sZW5ndGg7XG5cdFx0XHRcdFx0aWYgKGNvbG9yKSB7IC8vc2Vuc2UgcmdiYSgpIHZhbHVlcyBhbmQgcm91bmQgdGhlbS5cblx0XHRcdFx0XHRcdGNvbG9yID0gKGNvbG9yICsgMSkgJSA1O1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAobm9uTnVtYmVycy5zdWJzdHIoLTUpID09PSBcInJnYmEoXCIpIHtcblx0XHRcdFx0XHRcdGNvbG9yID0gMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnROdW0gPT09IHN0YXJ0TnVtc1tpXSB8fCBzdGFydE51bXMubGVuZ3RoIDw9IGkpIHtcblx0XHRcdFx0XHRcdHMgKz0gY3VycmVudE51bTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKHMpIHtcblx0XHRcdFx0XHRcdFx0YS5wdXNoKHMpO1xuXHRcdFx0XHRcdFx0XHRzID0gXCJcIjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdG51bSA9IHBhcnNlRmxvYXQoc3RhcnROdW1zW2ldKTtcblx0XHRcdFx0XHRcdGEucHVzaChudW0pO1xuXHRcdFx0XHRcdFx0YS5fZmlyc3RQVCA9IHtfbmV4dDogYS5fZmlyc3RQVCwgdDphLCBwOiBhLmxlbmd0aC0xLCBzOm51bSwgYzooKGN1cnJlbnROdW0uY2hhckF0KDEpID09PSBcIj1cIikgPyBwYXJzZUludChjdXJyZW50TnVtLmNoYXJBdCgwKSArIFwiMVwiLCAxMCkgKiBwYXJzZUZsb2F0KGN1cnJlbnROdW0uc3Vic3RyKDIpKSA6IChwYXJzZUZsb2F0KGN1cnJlbnROdW0pIC0gbnVtKSkgfHwgMCwgZjowLCByOihjb2xvciAmJiBjb2xvciA8IDQpfTtcblx0XHRcdFx0XHRcdC8vbm90ZTogd2UgZG9uJ3Qgc2V0IF9wcmV2IGJlY2F1c2Ugd2UnbGwgbmV2ZXIgbmVlZCB0byByZW1vdmUgaW5kaXZpZHVhbCBQcm9wVHdlZW5zIGZyb20gdGhpcyBsaXN0LlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaGFySW5kZXggKz0gY3VycmVudE51bS5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdFx0cyArPSBlbmQuc3Vic3RyKGNoYXJJbmRleCk7XG5cdFx0XHRcdGlmIChzKSB7XG5cdFx0XHRcdFx0YS5wdXNoKHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGEuc2V0UmF0aW8gPSBfc2V0UmF0aW87XG5cdFx0XHRcdHJldHVybiBhO1xuXHRcdFx0fSxcblx0XHRcdC8vbm90ZTogXCJmdW5jUGFyYW1cIiBpcyBvbmx5IG5lY2Vzc2FyeSBmb3IgZnVuY3Rpb24tYmFzZWQgZ2V0dGVycy9zZXR0ZXJzIHRoYXQgcmVxdWlyZSBhbiBleHRyYSBwYXJhbWV0ZXIgbGlrZSBnZXRBdHRyaWJ1dGUoXCJ3aWR0aFwiKSBhbmQgc2V0QXR0cmlidXRlKFwid2lkdGhcIiwgdmFsdWUpLiBJbiB0aGlzIGV4YW1wbGUsIGZ1bmNQYXJhbSB3b3VsZCBiZSBcIndpZHRoXCIuIFVzZWQgYnkgQXR0clBsdWdpbiBmb3IgZXhhbXBsZS5cblx0XHRcdF9hZGRQcm9wVHdlZW4gPSBmdW5jdGlvbih0YXJnZXQsIHByb3AsIHN0YXJ0LCBlbmQsIG92ZXJ3cml0ZVByb3AsIHJvdW5kLCBmdW5jUGFyYW0sIHN0cmluZ0ZpbHRlcikge1xuXHRcdFx0XHR2YXIgcyA9IChzdGFydCA9PT0gXCJnZXRcIikgPyB0YXJnZXRbcHJvcF0gOiBzdGFydCxcblx0XHRcdFx0XHR0eXBlID0gdHlwZW9mKHRhcmdldFtwcm9wXSksXG5cdFx0XHRcdFx0aXNSZWxhdGl2ZSA9ICh0eXBlb2YoZW5kKSA9PT0gXCJzdHJpbmdcIiAmJiBlbmQuY2hhckF0KDEpID09PSBcIj1cIiksXG5cdFx0XHRcdFx0cHQgPSB7dDp0YXJnZXQsIHA6cHJvcCwgczpzLCBmOih0eXBlID09PSBcImZ1bmN0aW9uXCIpLCBwZzowLCBuOm92ZXJ3cml0ZVByb3AgfHwgcHJvcCwgcjpyb3VuZCwgcHI6MCwgYzppc1JlbGF0aXZlID8gcGFyc2VJbnQoZW5kLmNoYXJBdCgwKSArIFwiMVwiLCAxMCkgKiBwYXJzZUZsb2F0KGVuZC5zdWJzdHIoMikpIDogKHBhcnNlRmxvYXQoZW5kKSAtIHMpIHx8IDB9LFxuXHRcdFx0XHRcdGJsb2IsIGdldHRlck5hbWU7XG5cdFx0XHRcdGlmICh0eXBlICE9PSBcIm51bWJlclwiKSB7XG5cdFx0XHRcdFx0aWYgKHR5cGUgPT09IFwiZnVuY3Rpb25cIiAmJiBzdGFydCA9PT0gXCJnZXRcIikge1xuXHRcdFx0XHRcdFx0Z2V0dGVyTmFtZSA9ICgocHJvcC5pbmRleE9mKFwic2V0XCIpIHx8IHR5cGVvZih0YXJnZXRbXCJnZXRcIiArIHByb3Auc3Vic3RyKDMpXSkgIT09IFwiZnVuY3Rpb25cIikgPyBwcm9wIDogXCJnZXRcIiArIHByb3Auc3Vic3RyKDMpKTtcblx0XHRcdFx0XHRcdHB0LnMgPSBzID0gZnVuY1BhcmFtID8gdGFyZ2V0W2dldHRlck5hbWVdKGZ1bmNQYXJhbSkgOiB0YXJnZXRbZ2V0dGVyTmFtZV0oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHR5cGVvZihzKSA9PT0gXCJzdHJpbmdcIiAmJiAoZnVuY1BhcmFtIHx8IGlzTmFOKHMpKSkge1xuXHRcdFx0XHRcdFx0Ly9hIGJsb2IgKHN0cmluZyB0aGF0IGhhcyBtdWx0aXBsZSBudW1iZXJzIGluIGl0KVxuXHRcdFx0XHRcdFx0cHQuZnAgPSBmdW5jUGFyYW07XG5cdFx0XHRcdFx0XHRibG9iID0gX2Jsb2JEaWYocywgZW5kLCBzdHJpbmdGaWx0ZXIgfHwgVHdlZW5MaXRlLmRlZmF1bHRTdHJpbmdGaWx0ZXIsIHB0KTtcblx0XHRcdFx0XHRcdHB0ID0ge3Q6YmxvYiwgcDpcInNldFJhdGlvXCIsIHM6MCwgYzoxLCBmOjIsIHBnOjAsIG46b3ZlcndyaXRlUHJvcCB8fCBwcm9wLCBwcjowfTsgLy9cIjJcIiBpbmRpY2F0ZXMgaXQncyBhIEJsb2IgcHJvcGVydHkgdHdlZW4uIE5lZWRlZCBmb3IgUm91bmRQcm9wc1BsdWdpbiBmb3IgZXhhbXBsZS5cblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFpc1JlbGF0aXZlKSB7XG5cdFx0XHRcdFx0XHRwdC5jID0gKHBhcnNlRmxvYXQoZW5kKSAtIHBhcnNlRmxvYXQocykpIHx8IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwdC5jKSB7IC8vb25seSBhZGQgaXQgdG8gdGhlIGxpbmtlZCBsaXN0IGlmIHRoZXJlJ3MgYSBjaGFuZ2UuXG5cdFx0XHRcdFx0aWYgKChwdC5fbmV4dCA9IHRoaXMuX2ZpcnN0UFQpKSB7XG5cdFx0XHRcdFx0XHRwdC5fbmV4dC5fcHJldiA9IHB0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9maXJzdFBUID0gcHQ7XG5cdFx0XHRcdFx0cmV0dXJuIHB0O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0X2ludGVybmFscyA9IFR3ZWVuTGl0ZS5faW50ZXJuYWxzID0ge2lzQXJyYXk6X2lzQXJyYXksIGlzU2VsZWN0b3I6X2lzU2VsZWN0b3IsIGxhenlUd2VlbnM6X2xhenlUd2VlbnMsIGJsb2JEaWY6X2Jsb2JEaWZ9LCAvL2dpdmVzIHVzIGEgd2F5IHRvIGV4cG9zZSBjZXJ0YWluIHByaXZhdGUgdmFsdWVzIHRvIG90aGVyIEdyZWVuU29jayBjbGFzc2VzIHdpdGhvdXQgY29udGFtaW5hdGluZyB0aGEgbWFpbiBUd2VlbkxpdGUgb2JqZWN0LlxuXHRcdFx0X3BsdWdpbnMgPSBUd2VlbkxpdGUuX3BsdWdpbnMgPSB7fSxcblx0XHRcdF90d2Vlbkxvb2t1cCA9IF9pbnRlcm5hbHMudHdlZW5Mb29rdXAgPSB7fSxcblx0XHRcdF90d2Vlbkxvb2t1cE51bSA9IDAsXG5cdFx0XHRfcmVzZXJ2ZWRQcm9wcyA9IF9pbnRlcm5hbHMucmVzZXJ2ZWRQcm9wcyA9IHtlYXNlOjEsIGRlbGF5OjEsIG92ZXJ3cml0ZToxLCBvbkNvbXBsZXRlOjEsIG9uQ29tcGxldGVQYXJhbXM6MSwgb25Db21wbGV0ZVNjb3BlOjEsIHVzZUZyYW1lczoxLCBydW5CYWNrd2FyZHM6MSwgc3RhcnRBdDoxLCBvblVwZGF0ZToxLCBvblVwZGF0ZVBhcmFtczoxLCBvblVwZGF0ZVNjb3BlOjEsIG9uU3RhcnQ6MSwgb25TdGFydFBhcmFtczoxLCBvblN0YXJ0U2NvcGU6MSwgb25SZXZlcnNlQ29tcGxldGU6MSwgb25SZXZlcnNlQ29tcGxldGVQYXJhbXM6MSwgb25SZXZlcnNlQ29tcGxldGVTY29wZToxLCBvblJlcGVhdDoxLCBvblJlcGVhdFBhcmFtczoxLCBvblJlcGVhdFNjb3BlOjEsIGVhc2VQYXJhbXM6MSwgeW95bzoxLCBpbW1lZGlhdGVSZW5kZXI6MSwgcmVwZWF0OjEsIHJlcGVhdERlbGF5OjEsIGRhdGE6MSwgcGF1c2VkOjEsIHJldmVyc2VkOjEsIGF1dG9DU1M6MSwgbGF6eToxLCBvbk92ZXJ3cml0ZToxLCBjYWxsYmFja1Njb3BlOjEsIHN0cmluZ0ZpbHRlcjoxfSxcblx0XHRcdF9vdmVyd3JpdGVMb29rdXAgPSB7bm9uZTowLCBhbGw6MSwgYXV0bzoyLCBjb25jdXJyZW50OjMsIGFsbE9uU3RhcnQ6NCwgcHJlZXhpc3Rpbmc6NSwgXCJ0cnVlXCI6MSwgXCJmYWxzZVwiOjB9LFxuXHRcdFx0X3Jvb3RGcmFtZXNUaW1lbGluZSA9IEFuaW1hdGlvbi5fcm9vdEZyYW1lc1RpbWVsaW5lID0gbmV3IFNpbXBsZVRpbWVsaW5lKCksXG5cdFx0XHRfcm9vdFRpbWVsaW5lID0gQW5pbWF0aW9uLl9yb290VGltZWxpbmUgPSBuZXcgU2ltcGxlVGltZWxpbmUoKSxcblx0XHRcdF9uZXh0R0NGcmFtZSA9IDMwLFxuXHRcdFx0X2xhenlSZW5kZXIgPSBfaW50ZXJuYWxzLmxhenlSZW5kZXIgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0dmFyIGkgPSBfbGF6eVR3ZWVucy5sZW5ndGgsXG5cdFx0XHRcdFx0dHdlZW47XG5cdFx0XHRcdF9sYXp5TG9va3VwID0ge307XG5cdFx0XHRcdHdoaWxlICgtLWkgPiAtMSkge1xuXHRcdFx0XHRcdHR3ZWVuID0gX2xhenlUd2VlbnNbaV07XG5cdFx0XHRcdFx0aWYgKHR3ZWVuICYmIHR3ZWVuLl9sYXp5ICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0dHdlZW4ucmVuZGVyKHR3ZWVuLl9sYXp5WzBdLCB0d2Vlbi5fbGF6eVsxXSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR0d2Vlbi5fbGF6eSA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRfbGF6eVR3ZWVucy5sZW5ndGggPSAwO1xuXHRcdFx0fTtcblxuXHRcdF9yb290VGltZWxpbmUuX3N0YXJ0VGltZSA9IF90aWNrZXIudGltZTtcblx0XHRfcm9vdEZyYW1lc1RpbWVsaW5lLl9zdGFydFRpbWUgPSBfdGlja2VyLmZyYW1lO1xuXHRcdF9yb290VGltZWxpbmUuX2FjdGl2ZSA9IF9yb290RnJhbWVzVGltZWxpbmUuX2FjdGl2ZSA9IHRydWU7XG5cdFx0c2V0VGltZW91dChfbGF6eVJlbmRlciwgMSk7IC8vb24gc29tZSBtb2JpbGUgZGV2aWNlcywgdGhlcmUgaXNuJ3QgYSBcInRpY2tcIiBiZWZvcmUgY29kZSBydW5zIHdoaWNoIG1lYW5zIGFueSBsYXp5IHJlbmRlcnMgd291bGRuJ3QgcnVuIGJlZm9yZSB0aGUgbmV4dCBvZmZpY2lhbCBcInRpY2tcIi5cblxuXHRcdEFuaW1hdGlvbi5fdXBkYXRlUm9vdCA9IFR3ZWVuTGl0ZS5yZW5kZXIgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0dmFyIGksIGEsIHA7XG5cdFx0XHRcdGlmIChfbGF6eVR3ZWVucy5sZW5ndGgpIHsgLy9pZiBjb2RlIGlzIHJ1biBvdXRzaWRlIG9mIHRoZSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgbG9vcCwgdGhlcmUgbWF5IGJlIHR3ZWVucyBxdWV1ZWQgQUZURVIgdGhlIGVuZ2luZSByZWZyZXNoZWQsIHNvIHdlIG5lZWQgdG8gZW5zdXJlIGFueSBwZW5kaW5nIHJlbmRlcnMgb2NjdXIgYmVmb3JlIHdlIHJlZnJlc2ggYWdhaW4uXG5cdFx0XHRcdFx0X2xhenlSZW5kZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRfcm9vdFRpbWVsaW5lLnJlbmRlcigoX3RpY2tlci50aW1lIC0gX3Jvb3RUaW1lbGluZS5fc3RhcnRUaW1lKSAqIF9yb290VGltZWxpbmUuX3RpbWVTY2FsZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdFx0X3Jvb3RGcmFtZXNUaW1lbGluZS5yZW5kZXIoKF90aWNrZXIuZnJhbWUgLSBfcm9vdEZyYW1lc1RpbWVsaW5lLl9zdGFydFRpbWUpICogX3Jvb3RGcmFtZXNUaW1lbGluZS5fdGltZVNjYWxlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0XHRpZiAoX2xhenlUd2VlbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0X2xhenlSZW5kZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoX3RpY2tlci5mcmFtZSA+PSBfbmV4dEdDRnJhbWUpIHsgLy9kdW1wIGdhcmJhZ2UgZXZlcnkgMTIwIGZyYW1lcyBvciB3aGF0ZXZlciB0aGUgdXNlciBzZXRzIFR3ZWVuTGl0ZS5hdXRvU2xlZXAgdG9cblx0XHRcdFx0XHRfbmV4dEdDRnJhbWUgPSBfdGlja2VyLmZyYW1lICsgKHBhcnNlSW50KFR3ZWVuTGl0ZS5hdXRvU2xlZXAsIDEwKSB8fCAxMjApO1xuXHRcdFx0XHRcdGZvciAocCBpbiBfdHdlZW5Mb29rdXApIHtcblx0XHRcdFx0XHRcdGEgPSBfdHdlZW5Mb29rdXBbcF0udHdlZW5zO1xuXHRcdFx0XHRcdFx0aSA9IGEubGVuZ3RoO1xuXHRcdFx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChhW2ldLl9nYykge1xuXHRcdFx0XHRcdFx0XHRcdGEuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoYS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0ZGVsZXRlIF90d2Vlbkxvb2t1cFtwXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly9pZiB0aGVyZSBhcmUgbm8gbW9yZSB0d2VlbnMgaW4gdGhlIHJvb3QgdGltZWxpbmVzLCBvciBpZiB0aGV5J3JlIGFsbCBwYXVzZWQsIG1ha2UgdGhlIF90aW1lciBzbGVlcCB0byByZWR1Y2UgbG9hZCBvbiB0aGUgQ1BVIHNsaWdodGx5XG5cdFx0XHRcdFx0cCA9IF9yb290VGltZWxpbmUuX2ZpcnN0O1xuXHRcdFx0XHRcdGlmICghcCB8fCBwLl9wYXVzZWQpIGlmIChUd2VlbkxpdGUuYXV0b1NsZWVwICYmICFfcm9vdEZyYW1lc1RpbWVsaW5lLl9maXJzdCAmJiBfdGlja2VyLl9saXN0ZW5lcnMudGljay5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdHdoaWxlIChwICYmIHAuX3BhdXNlZCkge1xuXHRcdFx0XHRcdFx0XHRwID0gcC5fbmV4dDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICghcCkge1xuXHRcdFx0XHRcdFx0XHRfdGlja2VyLnNsZWVwKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0X3RpY2tlci5hZGRFdmVudExpc3RlbmVyKFwidGlja1wiLCBBbmltYXRpb24uX3VwZGF0ZVJvb3QpO1xuXG5cdFx0dmFyIF9yZWdpc3RlciA9IGZ1bmN0aW9uKHRhcmdldCwgdHdlZW4sIHNjcnViKSB7XG5cdFx0XHRcdHZhciBpZCA9IHRhcmdldC5fZ3NUd2VlbklELCBhLCBpO1xuXHRcdFx0XHRpZiAoIV90d2Vlbkxvb2t1cFtpZCB8fCAodGFyZ2V0Ll9nc1R3ZWVuSUQgPSBpZCA9IFwidFwiICsgKF90d2Vlbkxvb2t1cE51bSsrKSldKSB7XG5cdFx0XHRcdFx0X3R3ZWVuTG9va3VwW2lkXSA9IHt0YXJnZXQ6dGFyZ2V0LCB0d2VlbnM6W119O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0d2Vlbikge1xuXHRcdFx0XHRcdGEgPSBfdHdlZW5Mb29rdXBbaWRdLnR3ZWVucztcblx0XHRcdFx0XHRhWyhpID0gYS5sZW5ndGgpXSA9IHR3ZWVuO1xuXHRcdFx0XHRcdGlmIChzY3J1Yikge1xuXHRcdFx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChhW2ldID09PSB0d2Vlbikge1xuXHRcdFx0XHRcdFx0XHRcdGEuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBfdHdlZW5Mb29rdXBbaWRdLnR3ZWVucztcblx0XHRcdH0sXG5cdFx0XHRfb25PdmVyd3JpdGUgPSBmdW5jdGlvbihvdmVyd3JpdHRlblR3ZWVuLCBvdmVyd3JpdGluZ1R3ZWVuLCB0YXJnZXQsIGtpbGxlZFByb3BzKSB7XG5cdFx0XHRcdHZhciBmdW5jID0gb3ZlcndyaXR0ZW5Ud2Vlbi52YXJzLm9uT3ZlcndyaXRlLCByMSwgcjI7XG5cdFx0XHRcdGlmIChmdW5jKSB7XG5cdFx0XHRcdFx0cjEgPSBmdW5jKG92ZXJ3cml0dGVuVHdlZW4sIG92ZXJ3cml0aW5nVHdlZW4sIHRhcmdldCwga2lsbGVkUHJvcHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZ1bmMgPSBUd2VlbkxpdGUub25PdmVyd3JpdGU7XG5cdFx0XHRcdGlmIChmdW5jKSB7XG5cdFx0XHRcdFx0cjIgPSBmdW5jKG92ZXJ3cml0dGVuVHdlZW4sIG92ZXJ3cml0aW5nVHdlZW4sIHRhcmdldCwga2lsbGVkUHJvcHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAocjEgIT09IGZhbHNlICYmIHIyICE9PSBmYWxzZSk7XG5cdFx0XHR9LFxuXHRcdFx0X2FwcGx5T3ZlcndyaXRlID0gZnVuY3Rpb24odGFyZ2V0LCB0d2VlbiwgcHJvcHMsIG1vZGUsIHNpYmxpbmdzKSB7XG5cdFx0XHRcdHZhciBpLCBjaGFuZ2VkLCBjdXJUd2VlbiwgbDtcblx0XHRcdFx0aWYgKG1vZGUgPT09IDEgfHwgbW9kZSA+PSA0KSB7XG5cdFx0XHRcdFx0bCA9IHNpYmxpbmdzLmxlbmd0aDtcblx0XHRcdFx0XHRmb3IgKGkgPSAwOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRpZiAoKGN1clR3ZWVuID0gc2libGluZ3NbaV0pICE9PSB0d2Vlbikge1xuXHRcdFx0XHRcdFx0XHRpZiAoIWN1clR3ZWVuLl9nYykge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChjdXJUd2Vlbi5fa2lsbChudWxsLCB0YXJnZXQsIHR3ZWVuKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKG1vZGUgPT09IDUpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBjaGFuZ2VkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vTk9URTogQWRkIDAuMDAwMDAwMDAwMSB0byBvdmVyY29tZSBmbG9hdGluZyBwb2ludCBlcnJvcnMgdGhhdCBjYW4gY2F1c2UgdGhlIHN0YXJ0VGltZSB0byBiZSBWRVJZIHNsaWdodGx5IG9mZiAod2hlbiBhIHR3ZWVuJ3MgdGltZSgpIGlzIHNldCBmb3IgZXhhbXBsZSlcblx0XHRcdFx0dmFyIHN0YXJ0VGltZSA9IHR3ZWVuLl9zdGFydFRpbWUgKyBfdGlueU51bSxcblx0XHRcdFx0XHRvdmVybGFwcyA9IFtdLFxuXHRcdFx0XHRcdG9Db3VudCA9IDAsXG5cdFx0XHRcdFx0emVyb0R1ciA9ICh0d2Vlbi5fZHVyYXRpb24gPT09IDApLFxuXHRcdFx0XHRcdGdsb2JhbFN0YXJ0O1xuXHRcdFx0XHRpID0gc2libGluZ3MubGVuZ3RoO1xuXHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHRpZiAoKGN1clR3ZWVuID0gc2libGluZ3NbaV0pID09PSB0d2VlbiB8fCBjdXJUd2Vlbi5fZ2MgfHwgY3VyVHdlZW4uX3BhdXNlZCkge1xuXHRcdFx0XHRcdFx0Ly9pZ25vcmVcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGN1clR3ZWVuLl90aW1lbGluZSAhPT0gdHdlZW4uX3RpbWVsaW5lKSB7XG5cdFx0XHRcdFx0XHRnbG9iYWxTdGFydCA9IGdsb2JhbFN0YXJ0IHx8IF9jaGVja092ZXJsYXAodHdlZW4sIDAsIHplcm9EdXIpO1xuXHRcdFx0XHRcdFx0aWYgKF9jaGVja092ZXJsYXAoY3VyVHdlZW4sIGdsb2JhbFN0YXJ0LCB6ZXJvRHVyKSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRvdmVybGFwc1tvQ291bnQrK10gPSBjdXJUd2Vlbjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGN1clR3ZWVuLl9zdGFydFRpbWUgPD0gc3RhcnRUaW1lKSBpZiAoY3VyVHdlZW4uX3N0YXJ0VGltZSArIGN1clR3ZWVuLnRvdGFsRHVyYXRpb24oKSAvIGN1clR3ZWVuLl90aW1lU2NhbGUgPiBzdGFydFRpbWUpIGlmICghKCh6ZXJvRHVyIHx8ICFjdXJUd2Vlbi5faW5pdHRlZCkgJiYgc3RhcnRUaW1lIC0gY3VyVHdlZW4uX3N0YXJ0VGltZSA8PSAwLjAwMDAwMDAwMDIpKSB7XG5cdFx0XHRcdFx0XHRvdmVybGFwc1tvQ291bnQrK10gPSBjdXJUd2Vlbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpID0gb0NvdW50O1xuXHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHRjdXJUd2VlbiA9IG92ZXJsYXBzW2ldO1xuXHRcdFx0XHRcdGlmIChtb2RlID09PSAyKSBpZiAoY3VyVHdlZW4uX2tpbGwocHJvcHMsIHRhcmdldCwgdHdlZW4pKSB7XG5cdFx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1vZGUgIT09IDIgfHwgKCFjdXJUd2Vlbi5fZmlyc3RQVCAmJiBjdXJUd2Vlbi5faW5pdHRlZCkpIHtcblx0XHRcdFx0XHRcdGlmIChtb2RlICE9PSAyICYmICFfb25PdmVyd3JpdGUoY3VyVHdlZW4sIHR3ZWVuKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChjdXJUd2Vlbi5fZW5hYmxlZChmYWxzZSwgZmFsc2UpKSB7IC8vaWYgYWxsIHByb3BlcnR5IHR3ZWVucyBoYXZlIGJlZW4gb3ZlcndyaXR0ZW4sIGtpbGwgdGhlIHR3ZWVuLlxuXHRcdFx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNoYW5nZWQ7XG5cdFx0XHR9LFxuXHRcdFx0X2NoZWNrT3ZlcmxhcCA9IGZ1bmN0aW9uKHR3ZWVuLCByZWZlcmVuY2UsIHplcm9EdXIpIHtcblx0XHRcdFx0dmFyIHRsID0gdHdlZW4uX3RpbWVsaW5lLFxuXHRcdFx0XHRcdHRzID0gdGwuX3RpbWVTY2FsZSxcblx0XHRcdFx0XHR0ID0gdHdlZW4uX3N0YXJ0VGltZTtcblx0XHRcdFx0d2hpbGUgKHRsLl90aW1lbGluZSkge1xuXHRcdFx0XHRcdHQgKz0gdGwuX3N0YXJ0VGltZTtcblx0XHRcdFx0XHR0cyAqPSB0bC5fdGltZVNjYWxlO1xuXHRcdFx0XHRcdGlmICh0bC5fcGF1c2VkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gLTEwMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGwgPSB0bC5fdGltZWxpbmU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dCAvPSB0cztcblx0XHRcdFx0cmV0dXJuICh0ID4gcmVmZXJlbmNlKSA/IHQgLSByZWZlcmVuY2UgOiAoKHplcm9EdXIgJiYgdCA9PT0gcmVmZXJlbmNlKSB8fCAoIXR3ZWVuLl9pbml0dGVkICYmIHQgLSByZWZlcmVuY2UgPCAyICogX3RpbnlOdW0pKSA/IF90aW55TnVtIDogKCh0ICs9IHR3ZWVuLnRvdGFsRHVyYXRpb24oKSAvIHR3ZWVuLl90aW1lU2NhbGUgLyB0cykgPiByZWZlcmVuY2UgKyBfdGlueU51bSkgPyAwIDogdCAtIHJlZmVyZW5jZSAtIF90aW55TnVtO1xuXHRcdFx0fTtcblxuXG4vLy0tLS0gVHdlZW5MaXRlIGluc3RhbmNlIG1ldGhvZHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRcdHAuX2luaXQgPSBmdW5jdGlvbigpIHtcblx0XHRcdHZhciB2ID0gdGhpcy52YXJzLFxuXHRcdFx0XHRvcCA9IHRoaXMuX292ZXJ3cml0dGVuUHJvcHMsXG5cdFx0XHRcdGR1ciA9IHRoaXMuX2R1cmF0aW9uLFxuXHRcdFx0XHRpbW1lZGlhdGUgPSAhIXYuaW1tZWRpYXRlUmVuZGVyLFxuXHRcdFx0XHRlYXNlID0gdi5lYXNlLFxuXHRcdFx0XHRpLCBpbml0UGx1Z2lucywgcHQsIHAsIHN0YXJ0VmFycztcblx0XHRcdGlmICh2LnN0YXJ0QXQpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXJ0QXQpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGFydEF0LnJlbmRlcigtMSwgdHJ1ZSk7IC8vaWYgd2UndmUgcnVuIGEgc3RhcnRBdCBwcmV2aW91c2x5ICh3aGVuIHRoZSB0d2VlbiBpbnN0YW50aWF0ZWQpLCB3ZSBzaG91bGQgcmV2ZXJ0IGl0IHNvIHRoYXQgdGhlIHZhbHVlcyByZS1pbnN0YW50aWF0ZSBjb3JyZWN0bHkgcGFydGljdWxhcmx5IGZvciByZWxhdGl2ZSB0d2VlbnMuIFdpdGhvdXQgdGhpcywgYSBUd2VlbkxpdGUuZnJvbVRvKG9iaiwgMSwge3g6XCIrPTEwMFwifSwge3g6XCItPTEwMFwifSksIGZvciBleGFtcGxlLCB3b3VsZCBhY3R1YWxseSBqdW1wIHRvICs9MjAwIGJlY2F1c2UgdGhlIHN0YXJ0QXQgd291bGQgcnVuIHR3aWNlLCBkb3VibGluZyB0aGUgcmVsYXRpdmUgY2hhbmdlLlxuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0QXQua2lsbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXJ0VmFycyA9IHt9O1xuXHRcdFx0XHRmb3IgKHAgaW4gdi5zdGFydEF0KSB7IC8vY29weSB0aGUgcHJvcGVydGllcy92YWx1ZXMgaW50byBhIG5ldyBvYmplY3QgdG8gYXZvaWQgY29sbGlzaW9ucywgbGlrZSB2YXIgdG8gPSB7eDowfSwgZnJvbSA9IHt4OjUwMH07IHRpbWVsaW5lLmZyb21UbyhlLCAxLCBmcm9tLCB0bykuZnJvbVRvKGUsIDEsIHRvLCBmcm9tKTtcblx0XHRcdFx0XHRzdGFydFZhcnNbcF0gPSB2LnN0YXJ0QXRbcF07XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhcnRWYXJzLm92ZXJ3cml0ZSA9IGZhbHNlO1xuXHRcdFx0XHRzdGFydFZhcnMuaW1tZWRpYXRlUmVuZGVyID0gdHJ1ZTtcblx0XHRcdFx0c3RhcnRWYXJzLmxhenkgPSAoaW1tZWRpYXRlICYmIHYubGF6eSAhPT0gZmFsc2UpO1xuXHRcdFx0XHRzdGFydFZhcnMuc3RhcnRBdCA9IHN0YXJ0VmFycy5kZWxheSA9IG51bGw7IC8vbm8gbmVzdGluZyBvZiBzdGFydEF0IG9iamVjdHMgYWxsb3dlZCAob3RoZXJ3aXNlIGl0IGNvdWxkIGNhdXNlIGFuIGluZmluaXRlIGxvb3ApLlxuXHRcdFx0XHR0aGlzLl9zdGFydEF0ID0gVHdlZW5MaXRlLnRvKHRoaXMudGFyZ2V0LCAwLCBzdGFydFZhcnMpO1xuXHRcdFx0XHRpZiAoaW1tZWRpYXRlKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3RpbWUgPiAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdGFydEF0ID0gbnVsbDsgLy90d2VlbnMgdGhhdCByZW5kZXIgaW1tZWRpYXRlbHkgKGxpa2UgbW9zdCBmcm9tKCkgYW5kIGZyb21UbygpIHR3ZWVucykgc2hvdWxkbid0IHJldmVydCB3aGVuIHRoZWlyIHBhcmVudCB0aW1lbGluZSdzIHBsYXloZWFkIGdvZXMgYmFja3dhcmQgcGFzdCB0aGUgc3RhcnRUaW1lIGJlY2F1c2UgdGhlIGluaXRpYWwgcmVuZGVyIGNvdWxkIGhhdmUgaGFwcGVuZWQgYW55dGltZSBhbmQgaXQgc2hvdWxkbid0IGJlIGRpcmVjdGx5IGNvcnJlbGF0ZWQgdG8gdGhpcyB0d2VlbidzIHN0YXJ0VGltZS4gSW1hZ2luZSBzZXR0aW5nIHVwIGEgY29tcGxleCBhbmltYXRpb24gd2hlcmUgdGhlIGJlZ2lubmluZyBzdGF0ZXMgb2YgdmFyaW91cyBvYmplY3RzIGFyZSByZW5kZXJlZCBpbW1lZGlhdGVseSBidXQgdGhlIHR3ZWVuIGRvZXNuJ3QgaGFwcGVuIGZvciBxdWl0ZSBzb21lIHRpbWUgLSBpZiB3ZSByZXZlcnQgdG8gdGhlIHN0YXJ0aW5nIHZhbHVlcyBhcyBzb29uIGFzIHRoZSBwbGF5aGVhZCBnb2VzIGJhY2t3YXJkIHBhc3QgdGhlIHR3ZWVuJ3Mgc3RhcnRUaW1lLCBpdCB3aWxsIHRocm93IHRoaW5ncyBvZmYgdmlzdWFsbHkuIFJldmVyc2lvbiBzaG91bGQgb25seSBoYXBwZW4gaW4gVGltZWxpbmVMaXRlL01heCBpbnN0YW5jZXMgd2hlcmUgaW1tZWRpYXRlUmVuZGVyIHdhcyBmYWxzZSAod2hpY2ggaXMgdGhlIGRlZmF1bHQgaW4gdGhlIGNvbnZlbmllbmNlIG1ldGhvZHMgbGlrZSBmcm9tKCkpLlxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZHVyICE9PSAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vd2Ugc2tpcCBpbml0aWFsaXphdGlvbiBoZXJlIHNvIHRoYXQgb3ZlcndyaXRpbmcgZG9lc24ndCBvY2N1ciB1bnRpbCB0aGUgdHdlZW4gYWN0dWFsbHkgYmVnaW5zLiBPdGhlcndpc2UsIGlmIHlvdSBjcmVhdGUgc2V2ZXJhbCBpbW1lZGlhdGVSZW5kZXI6dHJ1ZSB0d2VlbnMgb2YgdGhlIHNhbWUgdGFyZ2V0L3Byb3BlcnRpZXMgdG8gZHJvcCBpbnRvIGEgVGltZWxpbmVMaXRlIG9yIFRpbWVsaW5lTWF4LCB0aGUgbGFzdCBvbmUgY3JlYXRlZCB3b3VsZCBvdmVyd3JpdGUgdGhlIGZpcnN0IG9uZXMgYmVjYXVzZSB0aGV5IGRpZG4ndCBnZXQgcGxhY2VkIGludG8gdGhlIHRpbWVsaW5lIHlldCBiZWZvcmUgdGhlIGZpcnN0IHJlbmRlciBvY2N1cnMgYW5kIGtpY2tzIGluIG92ZXJ3cml0aW5nLlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh2LnJ1bkJhY2t3YXJkcyAmJiBkdXIgIT09IDApIHtcblx0XHRcdFx0Ly9mcm9tKCkgdHdlZW5zIG11c3QgYmUgaGFuZGxlZCB1bmlxdWVseTogdGhlaXIgYmVnaW5uaW5nIHZhbHVlcyBtdXN0IGJlIHJlbmRlcmVkIGJ1dCB3ZSBkb24ndCB3YW50IG92ZXJ3cml0aW5nIHRvIG9jY3VyIHlldCAod2hlbiB0aW1lIGlzIHN0aWxsIDApLiBXYWl0IHVudGlsIHRoZSB0d2VlbiBhY3R1YWxseSBiZWdpbnMgYmVmb3JlIGRvaW5nIGFsbCB0aGUgcm91dGluZXMgbGlrZSBvdmVyd3JpdGluZy4gQXQgdGhhdCB0aW1lLCB3ZSBzaG91bGQgcmVuZGVyIGF0IHRoZSBFTkQgb2YgdGhlIHR3ZWVuIHRvIGVuc3VyZSB0aGF0IHRoaW5ncyBpbml0aWFsaXplIGNvcnJlY3RseSAocmVtZW1iZXIsIGZyb20oKSB0d2VlbnMgZ28gYmFja3dhcmRzKVxuXHRcdFx0XHRpZiAodGhpcy5fc3RhcnRBdCkge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0QXQucmVuZGVyKC0xLCB0cnVlKTtcblx0XHRcdFx0XHR0aGlzLl9zdGFydEF0LmtpbGwoKTtcblx0XHRcdFx0XHR0aGlzLl9zdGFydEF0ID0gbnVsbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fdGltZSAhPT0gMCkgeyAvL2luIHJhcmUgY2FzZXMgKGxpa2UgaWYgYSBmcm9tKCkgdHdlZW4gcnVucyBhbmQgdGhlbiBpcyBpbnZhbGlkYXRlKCktZWQpLCBpbW1lZGlhdGVSZW5kZXIgY291bGQgYmUgdHJ1ZSBidXQgdGhlIGluaXRpYWwgZm9yY2VkLXJlbmRlciBnZXRzIHNraXBwZWQsIHNvIHRoZXJlJ3Mgbm8gbmVlZCB0byBmb3JjZSB0aGUgcmVuZGVyIGluIHRoaXMgY29udGV4dCB3aGVuIHRoZSBfdGltZSBpcyBncmVhdGVyIHRoYW4gMFxuXHRcdFx0XHRcdFx0aW1tZWRpYXRlID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHB0ID0ge307XG5cdFx0XHRcdFx0Zm9yIChwIGluIHYpIHsgLy9jb3B5IHByb3BzIGludG8gYSBuZXcgb2JqZWN0IGFuZCBza2lwIGFueSByZXNlcnZlZCBwcm9wcywgb3RoZXJ3aXNlIG9uQ29tcGxldGUgb3Igb25VcGRhdGUgb3Igb25TdGFydCBjb3VsZCBmaXJlLiBXZSBzaG91bGQsIGhvd2V2ZXIsIHBlcm1pdCBhdXRvQ1NTIHRvIGdvIHRocm91Z2guXG5cdFx0XHRcdFx0XHRpZiAoIV9yZXNlcnZlZFByb3BzW3BdIHx8IHAgPT09IFwiYXV0b0NTU1wiKSB7XG5cdFx0XHRcdFx0XHRcdHB0W3BdID0gdltwXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHQub3ZlcndyaXRlID0gMDtcblx0XHRcdFx0XHRwdC5kYXRhID0gXCJpc0Zyb21TdGFydFwiOyAvL3dlIHRhZyB0aGUgdHdlZW4gd2l0aCBhcyBcImlzRnJvbVN0YXJ0XCIgc28gdGhhdCBpZiBbaW5zaWRlIGEgcGx1Z2luXSB3ZSBuZWVkIHRvIG9ubHkgZG8gc29tZXRoaW5nIGF0IHRoZSB2ZXJ5IEVORCBvZiBhIHR3ZWVuLCB3ZSBoYXZlIGEgd2F5IG9mIGlkZW50aWZ5aW5nIHRoaXMgdHdlZW4gYXMgbWVyZWx5IHRoZSBvbmUgdGhhdCdzIHNldHRpbmcgdGhlIGJlZ2lubmluZyB2YWx1ZXMgZm9yIGEgXCJmcm9tKClcIiB0d2Vlbi4gRm9yIGV4YW1wbGUsIGNsZWFyUHJvcHMgaW4gQ1NTUGx1Z2luIHNob3VsZCBvbmx5IGdldCBhcHBsaWVkIGF0IHRoZSB2ZXJ5IEVORCBvZiBhIHR3ZWVuIGFuZCB3aXRob3V0IHRoaXMgdGFnLCBmcm9tKC4uLntoZWlnaHQ6MTAwLCBjbGVhclByb3BzOlwiaGVpZ2h0XCIsIGRlbGF5OjF9KSB3b3VsZCB3aXBlIHRoZSBoZWlnaHQgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgdHdlZW4gYW5kIGFmdGVyIDEgc2Vjb25kLCBpdCdkIGtpY2sgYmFjayBpbi5cblx0XHRcdFx0XHRwdC5sYXp5ID0gKGltbWVkaWF0ZSAmJiB2LmxhenkgIT09IGZhbHNlKTtcblx0XHRcdFx0XHRwdC5pbW1lZGlhdGVSZW5kZXIgPSBpbW1lZGlhdGU7IC8vemVyby1kdXJhdGlvbiB0d2VlbnMgcmVuZGVyIGltbWVkaWF0ZWx5IGJ5IGRlZmF1bHQsIGJ1dCBpZiB3ZSdyZSBub3Qgc3BlY2lmaWNhbGx5IGluc3RydWN0ZWQgdG8gcmVuZGVyIHRoaXMgdHdlZW4gaW1tZWRpYXRlbHksIHdlIHNob3VsZCBza2lwIHRoaXMgYW5kIG1lcmVseSBfaW5pdCgpIHRvIHJlY29yZCB0aGUgc3RhcnRpbmcgdmFsdWVzIChyZW5kZXJpbmcgdGhlbSBpbW1lZGlhdGVseSB3b3VsZCBwdXNoIHRoZW0gdG8gY29tcGxldGlvbiB3aGljaCBpcyB3YXN0ZWZ1bCBpbiB0aGF0IGNhc2UgLSB3ZSdkIGhhdmUgdG8gcmVuZGVyKC0xKSBpbW1lZGlhdGVseSBhZnRlcilcblx0XHRcdFx0XHR0aGlzLl9zdGFydEF0ID0gVHdlZW5MaXRlLnRvKHRoaXMudGFyZ2V0LCAwLCBwdCk7XG5cdFx0XHRcdFx0aWYgKCFpbW1lZGlhdGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3N0YXJ0QXQuX2luaXQoKTsgLy9lbnN1cmVzIHRoYXQgdGhlIGluaXRpYWwgdmFsdWVzIGFyZSByZWNvcmRlZFxuXHRcdFx0XHRcdFx0dGhpcy5fc3RhcnRBdC5fZW5hYmxlZChmYWxzZSk7IC8vbm8gbmVlZCB0byBoYXZlIHRoZSB0d2VlbiByZW5kZXIgb24gdGhlIG5leHQgY3ljbGUuIERpc2FibGUgaXQgYmVjYXVzZSB3ZSdsbCBhbHdheXMgbWFudWFsbHkgY29udHJvbCB0aGUgcmVuZGVycyBvZiB0aGUgX3N0YXJ0QXQgdHdlZW4uXG5cdFx0XHRcdFx0XHRpZiAodGhpcy52YXJzLmltbWVkaWF0ZVJlbmRlcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zdGFydEF0ID0gbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3RpbWUgPT09IDApIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2Vhc2UgPSBlYXNlID0gKCFlYXNlKSA/IFR3ZWVuTGl0ZS5kZWZhdWx0RWFzZSA6IChlYXNlIGluc3RhbmNlb2YgRWFzZSkgPyBlYXNlIDogKHR5cGVvZihlYXNlKSA9PT0gXCJmdW5jdGlvblwiKSA/IG5ldyBFYXNlKGVhc2UsIHYuZWFzZVBhcmFtcykgOiBfZWFzZU1hcFtlYXNlXSB8fCBUd2VlbkxpdGUuZGVmYXVsdEVhc2U7XG5cdFx0XHRpZiAodi5lYXNlUGFyYW1zIGluc3RhbmNlb2YgQXJyYXkgJiYgZWFzZS5jb25maWcpIHtcblx0XHRcdFx0dGhpcy5fZWFzZSA9IGVhc2UuY29uZmlnLmFwcGx5KGVhc2UsIHYuZWFzZVBhcmFtcyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lYXNlVHlwZSA9IHRoaXMuX2Vhc2UuX3R5cGU7XG5cdFx0XHR0aGlzLl9lYXNlUG93ZXIgPSB0aGlzLl9lYXNlLl9wb3dlcjtcblx0XHRcdHRoaXMuX2ZpcnN0UFQgPSBudWxsO1xuXG5cdFx0XHRpZiAodGhpcy5fdGFyZ2V0cykge1xuXHRcdFx0XHRpID0gdGhpcy5fdGFyZ2V0cy5sZW5ndGg7XG5cdFx0XHRcdHdoaWxlICgtLWkgPiAtMSkge1xuXHRcdFx0XHRcdGlmICggdGhpcy5faW5pdFByb3BzKCB0aGlzLl90YXJnZXRzW2ldLCAodGhpcy5fcHJvcExvb2t1cFtpXSA9IHt9KSwgdGhpcy5fc2libGluZ3NbaV0sIChvcCA/IG9wW2ldIDogbnVsbCkpICkge1xuXHRcdFx0XHRcdFx0aW5pdFBsdWdpbnMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5pdFBsdWdpbnMgPSB0aGlzLl9pbml0UHJvcHModGhpcy50YXJnZXQsIHRoaXMuX3Byb3BMb29rdXAsIHRoaXMuX3NpYmxpbmdzLCBvcCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbml0UGx1Z2lucykge1xuXHRcdFx0XHRUd2VlbkxpdGUuX29uUGx1Z2luRXZlbnQoXCJfb25Jbml0QWxsUHJvcHNcIiwgdGhpcyk7IC8vcmVvcmRlcnMgdGhlIGFycmF5IGluIG9yZGVyIG9mIHByaW9yaXR5LiBVc2VzIGEgc3RhdGljIFR3ZWVuUGx1Z2luIG1ldGhvZCBpbiBvcmRlciB0byBtaW5pbWl6ZSBmaWxlIHNpemUgaW4gVHdlZW5MaXRlXG5cdFx0XHR9XG5cdFx0XHRpZiAob3ApIGlmICghdGhpcy5fZmlyc3RQVCkgaWYgKHR5cGVvZih0aGlzLnRhcmdldCkgIT09IFwiZnVuY3Rpb25cIikgeyAvL2lmIGFsbCB0d2VlbmluZyBwcm9wZXJ0aWVzIGhhdmUgYmVlbiBvdmVyd3JpdHRlbiwga2lsbCB0aGUgdHdlZW4uIElmIHRoZSB0YXJnZXQgaXMgYSBmdW5jdGlvbiwgaXQncyBwcm9iYWJseSBhIGRlbGF5ZWRDYWxsIHNvIGxldCBpdCBsaXZlLlxuXHRcdFx0XHR0aGlzLl9lbmFibGVkKGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodi5ydW5CYWNrd2FyZHMpIHtcblx0XHRcdFx0cHQgPSB0aGlzLl9maXJzdFBUO1xuXHRcdFx0XHR3aGlsZSAocHQpIHtcblx0XHRcdFx0XHRwdC5zICs9IHB0LmM7XG5cdFx0XHRcdFx0cHQuYyA9IC1wdC5jO1xuXHRcdFx0XHRcdHB0ID0gcHQuX25leHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX29uVXBkYXRlID0gdi5vblVwZGF0ZTtcblx0XHRcdHRoaXMuX2luaXR0ZWQgPSB0cnVlO1xuXHRcdH07XG5cblx0XHRwLl9pbml0UHJvcHMgPSBmdW5jdGlvbih0YXJnZXQsIHByb3BMb29rdXAsIHNpYmxpbmdzLCBvdmVyd3JpdHRlblByb3BzKSB7XG5cdFx0XHR2YXIgcCwgaSwgaW5pdFBsdWdpbnMsIHBsdWdpbiwgcHQsIHY7XG5cdFx0XHRpZiAodGFyZ2V0ID09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoX2xhenlMb29rdXBbdGFyZ2V0Ll9nc1R3ZWVuSURdKSB7XG5cdFx0XHRcdF9sYXp5UmVuZGVyKCk7IC8vaWYgb3RoZXIgdHdlZW5zIG9mIHRoZSBzYW1lIHRhcmdldCBoYXZlIHJlY2VudGx5IGluaXR0ZWQgYnV0IGhhdmVuJ3QgcmVuZGVyZWQgeWV0LCB3ZSd2ZSBnb3QgdG8gZm9yY2UgdGhlIHJlbmRlciBzbyB0aGF0IHRoZSBzdGFydGluZyB2YWx1ZXMgYXJlIGNvcnJlY3QgKGltYWdpbmUgcG9wdWxhdGluZyBhIHRpbWVsaW5lIHdpdGggYSBidW5jaCBvZiBzZXF1ZW50aWFsIHR3ZWVucyBhbmQgdGhlbiBqdW1waW5nIHRvIHRoZSBlbmQpXG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy52YXJzLmNzcykgaWYgKHRhcmdldC5zdHlsZSkgaWYgKHRhcmdldCAhPT0gd2luZG93ICYmIHRhcmdldC5ub2RlVHlwZSkgaWYgKF9wbHVnaW5zLmNzcykgaWYgKHRoaXMudmFycy5hdXRvQ1NTICE9PSBmYWxzZSkgeyAvL2l0J3Mgc28gY29tbW9uIHRvIHVzZSBUd2VlbkxpdGUvTWF4IHRvIGFuaW1hdGUgdGhlIGNzcyBvZiBET00gZWxlbWVudHMsIHdlIGFzc3VtZSB0aGF0IGlmIHRoZSB0YXJnZXQgaXMgYSBET00gZWxlbWVudCwgdGhhdCdzIHdoYXQgaXMgaW50ZW5kZWQgKGEgY29udmVuaWVuY2Ugc28gdGhhdCB1c2VycyBkb24ndCBoYXZlIHRvIHdyYXAgdGhpbmdzIGluIGNzczp7fSwgYWx0aG91Z2ggd2Ugc3RpbGwgcmVjb21tZW5kIGl0IGZvciBhIHNsaWdodCBwZXJmb3JtYW5jZSBib29zdCBhbmQgYmV0dGVyIHNwZWNpZmljaXR5KS4gTm90ZTogd2UgY2Fubm90IGNoZWNrIFwibm9kZVR5cGVcIiBvbiB0aGUgd2luZG93IGluc2lkZSBhbiBpZnJhbWUuXG5cdFx0XHRcdF9hdXRvQ1NTKHRoaXMudmFycywgdGFyZ2V0KTtcblx0XHRcdH1cblx0XHRcdGZvciAocCBpbiB0aGlzLnZhcnMpIHtcblx0XHRcdFx0diA9IHRoaXMudmFyc1twXTtcblx0XHRcdFx0aWYgKF9yZXNlcnZlZFByb3BzW3BdKSB7XG5cdFx0XHRcdFx0aWYgKHYpIGlmICgodiBpbnN0YW5jZW9mIEFycmF5KSB8fCAodi5wdXNoICYmIF9pc0FycmF5KHYpKSkgaWYgKHYuam9pbihcIlwiKS5pbmRleE9mKFwie3NlbGZ9XCIpICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0dGhpcy52YXJzW3BdID0gdiA9IHRoaXMuX3N3YXBTZWxmSW5QYXJhbXModiwgdGhpcyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0gZWxzZSBpZiAoX3BsdWdpbnNbcF0gJiYgKHBsdWdpbiA9IG5ldyBfcGx1Z2luc1twXSgpKS5fb25Jbml0VHdlZW4odGFyZ2V0LCB0aGlzLnZhcnNbcF0sIHRoaXMpKSB7XG5cblx0XHRcdFx0XHQvL3QgLSB0YXJnZXQgXHRcdFtvYmplY3RdXG5cdFx0XHRcdFx0Ly9wIC0gcHJvcGVydHkgXHRcdFtzdHJpbmddXG5cdFx0XHRcdFx0Ly9zIC0gc3RhcnRcdFx0XHRbbnVtYmVyXVxuXHRcdFx0XHRcdC8vYyAtIGNoYW5nZVx0XHRbbnVtYmVyXVxuXHRcdFx0XHRcdC8vZiAtIGlzRnVuY3Rpb25cdFtib29sZWFuXVxuXHRcdFx0XHRcdC8vbiAtIG5hbWVcdFx0XHRbc3RyaW5nXVxuXHRcdFx0XHRcdC8vcGcgLSBpc1BsdWdpbiBcdFtib29sZWFuXVxuXHRcdFx0XHRcdC8vcHIgLSBwcmlvcml0eVx0XHRbbnVtYmVyXVxuXHRcdFx0XHRcdHRoaXMuX2ZpcnN0UFQgPSBwdCA9IHtfbmV4dDp0aGlzLl9maXJzdFBULCB0OnBsdWdpbiwgcDpcInNldFJhdGlvXCIsIHM6MCwgYzoxLCBmOjEsIG46cCwgcGc6MSwgcHI6cGx1Z2luLl9wcmlvcml0eX07XG5cdFx0XHRcdFx0aSA9IHBsdWdpbi5fb3ZlcndyaXRlUHJvcHMubGVuZ3RoO1xuXHRcdFx0XHRcdHdoaWxlICgtLWkgPiAtMSkge1xuXHRcdFx0XHRcdFx0cHJvcExvb2t1cFtwbHVnaW4uX292ZXJ3cml0ZVByb3BzW2ldXSA9IHRoaXMuX2ZpcnN0UFQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChwbHVnaW4uX3ByaW9yaXR5IHx8IHBsdWdpbi5fb25Jbml0QWxsUHJvcHMpIHtcblx0XHRcdFx0XHRcdGluaXRQbHVnaW5zID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBsdWdpbi5fb25EaXNhYmxlIHx8IHBsdWdpbi5fb25FbmFibGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX25vdGlmeVBsdWdpbnNPZkVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocHQuX25leHQpIHtcblx0XHRcdFx0XHRcdHB0Ll9uZXh0Ll9wcmV2ID0gcHQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvcExvb2t1cFtwXSA9IF9hZGRQcm9wVHdlZW4uY2FsbCh0aGlzLCB0YXJnZXQsIHAsIFwiZ2V0XCIsIHYsIHAsIDAsIG51bGwsIHRoaXMudmFycy5zdHJpbmdGaWx0ZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvdmVyd3JpdHRlblByb3BzKSBpZiAodGhpcy5fa2lsbChvdmVyd3JpdHRlblByb3BzLCB0YXJnZXQpKSB7IC8vYW5vdGhlciB0d2VlbiBtYXkgaGF2ZSB0cmllZCB0byBvdmVyd3JpdGUgcHJvcGVydGllcyBvZiB0aGlzIHR3ZWVuIGJlZm9yZSBpbml0KCkgd2FzIGNhbGxlZCAobGlrZSBpZiB0d28gdHdlZW5zIHN0YXJ0IGF0IHRoZSBzYW1lIHRpbWUsIHRoZSBvbmUgY3JlYXRlZCBzZWNvbmQgd2lsbCBydW4gZmlyc3QpXG5cdFx0XHRcdHJldHVybiB0aGlzLl9pbml0UHJvcHModGFyZ2V0LCBwcm9wTG9va3VwLCBzaWJsaW5ncywgb3ZlcndyaXR0ZW5Qcm9wcyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fb3ZlcndyaXRlID4gMSkgaWYgKHRoaXMuX2ZpcnN0UFQpIGlmIChzaWJsaW5ncy5sZW5ndGggPiAxKSBpZiAoX2FwcGx5T3ZlcndyaXRlKHRhcmdldCwgdGhpcywgcHJvcExvb2t1cCwgdGhpcy5fb3ZlcndyaXRlLCBzaWJsaW5ncykpIHtcblx0XHRcdFx0dGhpcy5fa2lsbChwcm9wTG9va3VwLCB0YXJnZXQpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faW5pdFByb3BzKHRhcmdldCwgcHJvcExvb2t1cCwgc2libGluZ3MsIG92ZXJ3cml0dGVuUHJvcHMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2ZpcnN0UFQpIGlmICgodGhpcy52YXJzLmxhenkgIT09IGZhbHNlICYmIHRoaXMuX2R1cmF0aW9uKSB8fCAodGhpcy52YXJzLmxhenkgJiYgIXRoaXMuX2R1cmF0aW9uKSkgeyAvL3plcm8gZHVyYXRpb24gdHdlZW5zIGRvbid0IGxhenkgcmVuZGVyIGJ5IGRlZmF1bHQ7IGV2ZXJ5dGhpbmcgZWxzZSBkb2VzLlxuXHRcdFx0XHRfbGF6eUxvb2t1cFt0YXJnZXQuX2dzVHdlZW5JRF0gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGluaXRQbHVnaW5zO1xuXHRcdH07XG5cblx0XHRwLnJlbmRlciA9IGZ1bmN0aW9uKHRpbWUsIHN1cHByZXNzRXZlbnRzLCBmb3JjZSkge1xuXHRcdFx0dmFyIHByZXZUaW1lID0gdGhpcy5fdGltZSxcblx0XHRcdFx0ZHVyYXRpb24gPSB0aGlzLl9kdXJhdGlvbixcblx0XHRcdFx0cHJldlJhd1ByZXZUaW1lID0gdGhpcy5fcmF3UHJldlRpbWUsXG5cdFx0XHRcdGlzQ29tcGxldGUsIGNhbGxiYWNrLCBwdCwgcmF3UHJldlRpbWU7XG5cdFx0XHRpZiAodGltZSA+PSBkdXJhdGlvbikge1xuXHRcdFx0XHR0aGlzLl90b3RhbFRpbWUgPSB0aGlzLl90aW1lID0gZHVyYXRpb247XG5cdFx0XHRcdHRoaXMucmF0aW8gPSB0aGlzLl9lYXNlLl9jYWxjRW5kID8gdGhpcy5fZWFzZS5nZXRSYXRpbygxKSA6IDE7XG5cdFx0XHRcdGlmICghdGhpcy5fcmV2ZXJzZWQgKSB7XG5cdFx0XHRcdFx0aXNDb21wbGV0ZSA9IHRydWU7XG5cdFx0XHRcdFx0Y2FsbGJhY2sgPSBcIm9uQ29tcGxldGVcIjtcblx0XHRcdFx0XHRmb3JjZSA9IChmb3JjZSB8fCB0aGlzLl90aW1lbGluZS5hdXRvUmVtb3ZlQ2hpbGRyZW4pOyAvL290aGVyd2lzZSwgaWYgdGhlIGFuaW1hdGlvbiBpcyB1bnBhdXNlZC9hY3RpdmF0ZWQgYWZ0ZXIgaXQncyBhbHJlYWR5IGZpbmlzaGVkLCBpdCBkb2Vzbid0IGdldCByZW1vdmVkIGZyb20gdGhlIHBhcmVudCB0aW1lbGluZS5cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZHVyYXRpb24gPT09IDApIGlmICh0aGlzLl9pbml0dGVkIHx8ICF0aGlzLnZhcnMubGF6eSB8fCBmb3JjZSkgeyAvL3plcm8tZHVyYXRpb24gdHdlZW5zIGFyZSB0cmlja3kgYmVjYXVzZSB3ZSBtdXN0IGRpc2Nlcm4gdGhlIG1vbWVudHVtL2RpcmVjdGlvbiBvZiB0aW1lIGluIG9yZGVyIHRvIGRldGVybWluZSB3aGV0aGVyIHRoZSBzdGFydGluZyB2YWx1ZXMgc2hvdWxkIGJlIHJlbmRlcmVkIG9yIHRoZSBlbmRpbmcgdmFsdWVzLiBJZiB0aGUgXCJwbGF5aGVhZFwiIG9mIGl0cyB0aW1lbGluZSBnb2VzIHBhc3QgdGhlIHplcm8tZHVyYXRpb24gdHdlZW4gaW4gdGhlIGZvcndhcmQgZGlyZWN0aW9uIG9yIGxhbmRzIGRpcmVjdGx5IG9uIGl0LCB0aGUgZW5kIHZhbHVlcyBzaG91bGQgYmUgcmVuZGVyZWQsIGJ1dCBpZiB0aGUgdGltZWxpbmUncyBcInBsYXloZWFkXCIgbW92ZXMgcGFzdCBpdCBpbiB0aGUgYmFja3dhcmQgZGlyZWN0aW9uIChmcm9tIGEgcG9zdGl0aXZlIHRpbWUgdG8gYSBuZWdhdGl2ZSB0aW1lKSwgdGhlIHN0YXJ0aW5nIHZhbHVlcyBtdXN0IGJlIHJlbmRlcmVkLlxuXHRcdFx0XHRcdGlmICh0aGlzLl9zdGFydFRpbWUgPT09IHRoaXMuX3RpbWVsaW5lLl9kdXJhdGlvbikgeyAvL2lmIGEgemVyby1kdXJhdGlvbiB0d2VlbiBpcyBhdCB0aGUgVkVSWSBlbmQgb2YgYSB0aW1lbGluZSBhbmQgdGhhdCB0aW1lbGluZSByZW5kZXJzIGF0IGl0cyBlbmQsIGl0IHdpbGwgdHlwaWNhbGx5IGFkZCBhIHRpbnkgYml0IG9mIGN1c2hpb24gdG8gdGhlIHJlbmRlciB0aW1lIHRvIHByZXZlbnQgcm91bmRpbmcgZXJyb3JzIGZyb20gZ2V0dGluZyBpbiB0aGUgd2F5IG9mIHR3ZWVucyByZW5kZXJpbmcgdGhlaXIgVkVSWSBlbmQuIElmIHdlIHRoZW4gcmV2ZXJzZSgpIHRoYXQgdGltZWxpbmUsIHRoZSB6ZXJvLWR1cmF0aW9uIHR3ZWVuIHdpbGwgdHJpZ2dlciBpdHMgb25SZXZlcnNlQ29tcGxldGUgZXZlbiB0aG91Z2ggdGVjaG5pY2FsbHkgdGhlIHBsYXloZWFkIGRpZG4ndCBwYXNzIG92ZXIgaXQgYWdhaW4uIEl0J3MgYSB2ZXJ5IHNwZWNpZmljIGVkZ2UgY2FzZSB3ZSBtdXN0IGFjY29tbW9kYXRlLlxuXHRcdFx0XHRcdFx0dGltZSA9IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0aW1lID09PSAwIHx8IHByZXZSYXdQcmV2VGltZSA8IDAgfHwgKHByZXZSYXdQcmV2VGltZSA9PT0gX3RpbnlOdW0gJiYgdGhpcy5kYXRhICE9PSBcImlzUGF1c2VcIikpIGlmIChwcmV2UmF3UHJldlRpbWUgIT09IHRpbWUpIHsgLy9ub3RlOiB3aGVuIHRoaXMuZGF0YSBpcyBcImlzUGF1c2VcIiwgaXQncyBhIGNhbGxiYWNrIGFkZGVkIGJ5IGFkZFBhdXNlKCkgb24gYSB0aW1lbGluZSB0aGF0IHdlIHNob3VsZCBub3QgYmUgdHJpZ2dlcmVkIHdoZW4gTEVBVklORyBpdHMgZXhhY3Qgc3RhcnQgdGltZS4gSW4gb3RoZXIgd29yZHMsIHRsLmFkZFBhdXNlKDEpLnBsYXkoMSkgc2hvdWxkbid0IHBhdXNlLlxuXHRcdFx0XHRcdFx0Zm9yY2UgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aWYgKHByZXZSYXdQcmV2VGltZSA+IF90aW55TnVtKSB7XG5cdFx0XHRcdFx0XHRcdGNhbGxiYWNrID0gXCJvblJldmVyc2VDb21wbGV0ZVwiO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9yYXdQcmV2VGltZSA9IHJhd1ByZXZUaW1lID0gKCFzdXBwcmVzc0V2ZW50cyB8fCB0aW1lIHx8IHByZXZSYXdQcmV2VGltZSA9PT0gdGltZSkgPyB0aW1lIDogX3RpbnlOdW07IC8vd2hlbiB0aGUgcGxheWhlYWQgYXJyaXZlcyBhdCBFWEFDVExZIHRpbWUgMCAocmlnaHQgb24gdG9wKSBvZiBhIHplcm8tZHVyYXRpb24gdHdlZW4sIHdlIG5lZWQgdG8gZGlzY2VybiBpZiBldmVudHMgYXJlIHN1cHByZXNzZWQgc28gdGhhdCB3aGVuIHRoZSBwbGF5aGVhZCBtb3ZlcyBhZ2FpbiAobmV4dCB0aW1lKSwgaXQnbGwgdHJpZ2dlciB0aGUgY2FsbGJhY2suIElmIGV2ZW50cyBhcmUgTk9UIHN1cHByZXNzZWQsIG9idmlvdXNseSB0aGUgY2FsbGJhY2sgd291bGQgYmUgdHJpZ2dlcmVkIGluIHRoaXMgcmVuZGVyLiBCYXNpY2FsbHksIHRoZSBjYWxsYmFjayBzaG91bGQgZmlyZSBlaXRoZXIgd2hlbiB0aGUgcGxheWhlYWQgQVJSSVZFUyBvciBMRUFWRVMgdGhpcyBleGFjdCBzcG90LCBub3QgYm90aC4gSW1hZ2luZSBkb2luZyBhIHRpbWVsaW5lLnNlZWsoMCkgYW5kIHRoZXJlJ3MgYSBjYWxsYmFjayB0aGF0IHNpdHMgYXQgMC4gU2luY2UgZXZlbnRzIGFyZSBzdXBwcmVzc2VkIG9uIHRoYXQgc2VlaygpIGJ5IGRlZmF1bHQsIG5vdGhpbmcgd2lsbCBmaXJlLCBidXQgd2hlbiB0aGUgcGxheWhlYWQgbW92ZXMgb2ZmIG9mIHRoYXQgcG9zaXRpb24sIHRoZSBjYWxsYmFjayBzaG91bGQgZmlyZS4gVGhpcyBiZWhhdmlvciBpcyB3aGF0IHBlb3BsZSBpbnR1aXRpdmVseSBleHBlY3QuIFdlIHNldCB0aGUgX3Jhd1ByZXZUaW1lIHRvIGJlIGEgcHJlY2lzZSB0aW55IG51bWJlciB0byBpbmRpY2F0ZSB0aGlzIHNjZW5hcmlvIHJhdGhlciB0aGFuIHVzaW5nIGFub3RoZXIgcHJvcGVydHkvdmFyaWFibGUgd2hpY2ggd291bGQgaW5jcmVhc2UgbWVtb3J5IHVzYWdlLiBUaGlzIHRlY2huaXF1ZSBpcyBsZXNzIHJlYWRhYmxlLCBidXQgbW9yZSBlZmZpY2llbnQuXG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIGlmICh0aW1lIDwgMC4wMDAwMDAxKSB7IC8vdG8gd29yayBhcm91bmQgb2NjYXNpb25hbCBmbG9hdGluZyBwb2ludCBtYXRoIGFydGlmYWN0cywgcm91bmQgc3VwZXIgc21hbGwgdmFsdWVzIHRvIDAuXG5cdFx0XHRcdHRoaXMuX3RvdGFsVGltZSA9IHRoaXMuX3RpbWUgPSAwO1xuXHRcdFx0XHR0aGlzLnJhdGlvID0gdGhpcy5fZWFzZS5fY2FsY0VuZCA/IHRoaXMuX2Vhc2UuZ2V0UmF0aW8oMCkgOiAwO1xuXHRcdFx0XHRpZiAocHJldlRpbWUgIT09IDAgfHwgKGR1cmF0aW9uID09PSAwICYmIHByZXZSYXdQcmV2VGltZSA+IDApKSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2sgPSBcIm9uUmV2ZXJzZUNvbXBsZXRlXCI7XG5cdFx0XHRcdFx0aXNDb21wbGV0ZSA9IHRoaXMuX3JldmVyc2VkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aW1lIDwgMCkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmIChkdXJhdGlvbiA9PT0gMCkgaWYgKHRoaXMuX2luaXR0ZWQgfHwgIXRoaXMudmFycy5sYXp5IHx8IGZvcmNlKSB7IC8vemVyby1kdXJhdGlvbiB0d2VlbnMgYXJlIHRyaWNreSBiZWNhdXNlIHdlIG11c3QgZGlzY2VybiB0aGUgbW9tZW50dW0vZGlyZWN0aW9uIG9mIHRpbWUgaW4gb3JkZXIgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdGhlIHN0YXJ0aW5nIHZhbHVlcyBzaG91bGQgYmUgcmVuZGVyZWQgb3IgdGhlIGVuZGluZyB2YWx1ZXMuIElmIHRoZSBcInBsYXloZWFkXCIgb2YgaXRzIHRpbWVsaW5lIGdvZXMgcGFzdCB0aGUgemVyby1kdXJhdGlvbiB0d2VlbiBpbiB0aGUgZm9yd2FyZCBkaXJlY3Rpb24gb3IgbGFuZHMgZGlyZWN0bHkgb24gaXQsIHRoZSBlbmQgdmFsdWVzIHNob3VsZCBiZSByZW5kZXJlZCwgYnV0IGlmIHRoZSB0aW1lbGluZSdzIFwicGxheWhlYWRcIiBtb3ZlcyBwYXN0IGl0IGluIHRoZSBiYWNrd2FyZCBkaXJlY3Rpb24gKGZyb20gYSBwb3N0aXRpdmUgdGltZSB0byBhIG5lZ2F0aXZlIHRpbWUpLCB0aGUgc3RhcnRpbmcgdmFsdWVzIG11c3QgYmUgcmVuZGVyZWQuXG5cdFx0XHRcdFx0XHRpZiAocHJldlJhd1ByZXZUaW1lID49IDAgJiYgIShwcmV2UmF3UHJldlRpbWUgPT09IF90aW55TnVtICYmIHRoaXMuZGF0YSA9PT0gXCJpc1BhdXNlXCIpKSB7XG5cdFx0XHRcdFx0XHRcdGZvcmNlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuX3Jhd1ByZXZUaW1lID0gcmF3UHJldlRpbWUgPSAoIXN1cHByZXNzRXZlbnRzIHx8IHRpbWUgfHwgcHJldlJhd1ByZXZUaW1lID09PSB0aW1lKSA/IHRpbWUgOiBfdGlueU51bTsgLy93aGVuIHRoZSBwbGF5aGVhZCBhcnJpdmVzIGF0IEVYQUNUTFkgdGltZSAwIChyaWdodCBvbiB0b3ApIG9mIGEgemVyby1kdXJhdGlvbiB0d2Vlbiwgd2UgbmVlZCB0byBkaXNjZXJuIGlmIGV2ZW50cyBhcmUgc3VwcHJlc3NlZCBzbyB0aGF0IHdoZW4gdGhlIHBsYXloZWFkIG1vdmVzIGFnYWluIChuZXh0IHRpbWUpLCBpdCdsbCB0cmlnZ2VyIHRoZSBjYWxsYmFjay4gSWYgZXZlbnRzIGFyZSBOT1Qgc3VwcHJlc3NlZCwgb2J2aW91c2x5IHRoZSBjYWxsYmFjayB3b3VsZCBiZSB0cmlnZ2VyZWQgaW4gdGhpcyByZW5kZXIuIEJhc2ljYWxseSwgdGhlIGNhbGxiYWNrIHNob3VsZCBmaXJlIGVpdGhlciB3aGVuIHRoZSBwbGF5aGVhZCBBUlJJVkVTIG9yIExFQVZFUyB0aGlzIGV4YWN0IHNwb3QsIG5vdCBib3RoLiBJbWFnaW5lIGRvaW5nIGEgdGltZWxpbmUuc2VlaygwKSBhbmQgdGhlcmUncyBhIGNhbGxiYWNrIHRoYXQgc2l0cyBhdCAwLiBTaW5jZSBldmVudHMgYXJlIHN1cHByZXNzZWQgb24gdGhhdCBzZWVrKCkgYnkgZGVmYXVsdCwgbm90aGluZyB3aWxsIGZpcmUsIGJ1dCB3aGVuIHRoZSBwbGF5aGVhZCBtb3ZlcyBvZmYgb2YgdGhhdCBwb3NpdGlvbiwgdGhlIGNhbGxiYWNrIHNob3VsZCBmaXJlLiBUaGlzIGJlaGF2aW9yIGlzIHdoYXQgcGVvcGxlIGludHVpdGl2ZWx5IGV4cGVjdC4gV2Ugc2V0IHRoZSBfcmF3UHJldlRpbWUgdG8gYmUgYSBwcmVjaXNlIHRpbnkgbnVtYmVyIHRvIGluZGljYXRlIHRoaXMgc2NlbmFyaW8gcmF0aGVyIHRoYW4gdXNpbmcgYW5vdGhlciBwcm9wZXJ0eS92YXJpYWJsZSB3aGljaCB3b3VsZCBpbmNyZWFzZSBtZW1vcnkgdXNhZ2UuIFRoaXMgdGVjaG5pcXVlIGlzIGxlc3MgcmVhZGFibGUsIGJ1dCBtb3JlIGVmZmljaWVudC5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF0aGlzLl9pbml0dGVkKSB7IC8vaWYgd2UgcmVuZGVyIHRoZSB2ZXJ5IGJlZ2lubmluZyAodGltZSA9PSAwKSBvZiBhIGZyb21UbygpLCB3ZSBtdXN0IGZvcmNlIHRoZSByZW5kZXIgKG5vcm1hbCB0d2VlbnMgd291bGRuJ3QgbmVlZCB0byByZW5kZXIgYXQgYSB0aW1lIG9mIDAgd2hlbiB0aGUgcHJldlRpbWUgd2FzIGFsc28gMCkuIFRoaXMgaXMgYWxzbyBtYW5kYXRvcnkgdG8gbWFrZSBzdXJlIG92ZXJ3cml0aW5nIGtpY2tzIGluIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHRcdGZvcmNlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fdG90YWxUaW1lID0gdGhpcy5fdGltZSA9IHRpbWU7XG5cblx0XHRcdFx0aWYgKHRoaXMuX2Vhc2VUeXBlKSB7XG5cdFx0XHRcdFx0dmFyIHIgPSB0aW1lIC8gZHVyYXRpb24sIHR5cGUgPSB0aGlzLl9lYXNlVHlwZSwgcG93ID0gdGhpcy5fZWFzZVBvd2VyO1xuXHRcdFx0XHRcdGlmICh0eXBlID09PSAxIHx8ICh0eXBlID09PSAzICYmIHIgPj0gMC41KSkge1xuXHRcdFx0XHRcdFx0ciA9IDEgLSByO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodHlwZSA9PT0gMykge1xuXHRcdFx0XHRcdFx0ciAqPSAyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocG93ID09PSAxKSB7XG5cdFx0XHRcdFx0XHRyICo9IHI7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwb3cgPT09IDIpIHtcblx0XHRcdFx0XHRcdHIgKj0gciAqIHI7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwb3cgPT09IDMpIHtcblx0XHRcdFx0XHRcdHIgKj0gciAqIHIgKiByO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocG93ID09PSA0KSB7XG5cdFx0XHRcdFx0XHRyICo9IHIgKiByICogciAqIHI7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHR5cGUgPT09IDEpIHtcblx0XHRcdFx0XHRcdHRoaXMucmF0aW8gPSAxIC0gcjtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGUgPT09IDIpIHtcblx0XHRcdFx0XHRcdHRoaXMucmF0aW8gPSByO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodGltZSAvIGR1cmF0aW9uIDwgMC41KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJhdGlvID0gciAvIDI7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMucmF0aW8gPSAxIC0gKHIgLyAyKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnJhdGlvID0gdGhpcy5fZWFzZS5nZXRSYXRpbyh0aW1lIC8gZHVyYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl90aW1lID09PSBwcmV2VGltZSAmJiAhZm9yY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIGlmICghdGhpcy5faW5pdHRlZCkge1xuXHRcdFx0XHR0aGlzLl9pbml0KCk7XG5cdFx0XHRcdGlmICghdGhpcy5faW5pdHRlZCB8fCB0aGlzLl9nYykgeyAvL2ltbWVkaWF0ZVJlbmRlciB0d2VlbnMgdHlwaWNhbGx5IHdvbid0IGluaXRpYWxpemUgdW50aWwgdGhlIHBsYXloZWFkIGFkdmFuY2VzIChfdGltZSBpcyBncmVhdGVyIHRoYW4gMCkgaW4gb3JkZXIgdG8gZW5zdXJlIHRoYXQgb3ZlcndyaXRpbmcgb2NjdXJzIHByb3Blcmx5LiBBbHNvLCBpZiBhbGwgb2YgdGhlIHR3ZWVuaW5nIHByb3BlcnRpZXMgaGF2ZSBiZWVuIG92ZXJ3cml0dGVuICh3aGljaCB3b3VsZCBjYXVzZSBfZ2MgdG8gYmUgdHJ1ZSwgYXMgc2V0IGluIF9pbml0KCkpLCB3ZSBzaG91bGRuJ3QgY29udGludWUgb3RoZXJ3aXNlIGFuIG9uU3RhcnQgY2FsbGJhY2sgY291bGQgYmUgY2FsbGVkIGZvciBleGFtcGxlLlxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIGlmICghZm9yY2UgJiYgdGhpcy5fZmlyc3RQVCAmJiAoKHRoaXMudmFycy5sYXp5ICE9PSBmYWxzZSAmJiB0aGlzLl9kdXJhdGlvbikgfHwgKHRoaXMudmFycy5sYXp5ICYmICF0aGlzLl9kdXJhdGlvbikpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGltZSA9IHRoaXMuX3RvdGFsVGltZSA9IHByZXZUaW1lO1xuXHRcdFx0XHRcdHRoaXMuX3Jhd1ByZXZUaW1lID0gcHJldlJhd1ByZXZUaW1lO1xuXHRcdFx0XHRcdF9sYXp5VHdlZW5zLnB1c2godGhpcyk7XG5cdFx0XHRcdFx0dGhpcy5fbGF6eSA9IFt0aW1lLCBzdXBwcmVzc0V2ZW50c107XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vX2Vhc2UgaXMgaW5pdGlhbGx5IHNldCB0byBkZWZhdWx0RWFzZSwgc28gbm93IHRoYXQgaW5pdCgpIGhhcyBydW4sIF9lYXNlIGlzIHNldCBwcm9wZXJseSBhbmQgd2UgbmVlZCB0byByZWNhbGN1bGF0ZSB0aGUgcmF0aW8uIE92ZXJhbGwgdGhpcyBpcyBmYXN0ZXIgdGhhbiB1c2luZyBjb25kaXRpb25hbCBsb2dpYyBlYXJsaWVyIGluIHRoZSBtZXRob2QgdG8gYXZvaWQgaGF2aW5nIHRvIHNldCByYXRpbyB0d2ljZSBiZWNhdXNlIHdlIG9ubHkgaW5pdCgpIG9uY2UgYnV0IHJlbmRlclRpbWUoKSBnZXRzIGNhbGxlZCBWRVJZIGZyZXF1ZW50bHkuXG5cdFx0XHRcdGlmICh0aGlzLl90aW1lICYmICFpc0NvbXBsZXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5yYXRpbyA9IHRoaXMuX2Vhc2UuZ2V0UmF0aW8odGhpcy5fdGltZSAvIGR1cmF0aW9uKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc0NvbXBsZXRlICYmIHRoaXMuX2Vhc2UuX2NhbGNFbmQpIHtcblx0XHRcdFx0XHR0aGlzLnJhdGlvID0gdGhpcy5fZWFzZS5nZXRSYXRpbygodGhpcy5fdGltZSA9PT0gMCkgPyAwIDogMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9sYXp5ICE9PSBmYWxzZSkgeyAvL2luIGNhc2UgYSBsYXp5IHJlbmRlciBpcyBwZW5kaW5nLCB3ZSBzaG91bGQgZmx1c2ggaXQgYmVjYXVzZSB0aGUgbmV3IHJlbmRlciBpcyBvY2N1cnJpbmcgbm93IChpbWFnaW5lIGEgbGF6eSB0d2VlbiBpbnN0YW50aWF0aW5nIGFuZCB0aGVuIGltbWVkaWF0ZWx5IHRoZSB1c2VyIGNhbGxzIHR3ZWVuLnNlZWsodHdlZW4uZHVyYXRpb24oKSksIHNraXBwaW5nIHRvIHRoZSBlbmQgLSB0aGUgZW5kIHJlbmRlciB3b3VsZCBiZSBmb3JjZWQsIGFuZCB0aGVuIGlmIHdlIGRpZG4ndCBmbHVzaCB0aGUgbGF6eSByZW5kZXIsIGl0J2QgZmlyZSBBRlRFUiB0aGUgc2VlaygpLCByZW5kZXJpbmcgaXQgYXQgdGhlIHdyb25nIHRpbWUuXG5cdFx0XHRcdHRoaXMuX2xhenkgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fYWN0aXZlKSBpZiAoIXRoaXMuX3BhdXNlZCAmJiB0aGlzLl90aW1lICE9PSBwcmV2VGltZSAmJiB0aW1lID49IDApIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlID0gdHJ1ZTsgIC8vc28gdGhhdCBpZiB0aGUgdXNlciByZW5kZXJzIGEgdHdlZW4gKGFzIG9wcG9zZWQgdG8gdGhlIHRpbWVsaW5lIHJlbmRlcmluZyBpdCksIHRoZSB0aW1lbGluZSBpcyBmb3JjZWQgdG8gcmUtcmVuZGVyIGFuZCBhbGlnbiBpdCB3aXRoIHRoZSBwcm9wZXIgdGltZS9mcmFtZSBvbiB0aGUgbmV4dCByZW5kZXJpbmcgY3ljbGUuIE1heWJlIHRoZSB0d2VlbiBhbHJlYWR5IGZpbmlzaGVkIGJ1dCB0aGUgdXNlciBtYW51YWxseSByZS1yZW5kZXJzIGl0IGFzIGhhbGZ3YXkgZG9uZS5cblx0XHRcdH1cblx0XHRcdGlmIChwcmV2VGltZSA9PT0gMCkge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhcnRBdCkge1xuXHRcdFx0XHRcdGlmICh0aW1lID49IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuX3N0YXJ0QXQucmVuZGVyKHRpbWUsIHN1cHByZXNzRXZlbnRzLCBmb3JjZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghY2FsbGJhY2spIHtcblx0XHRcdFx0XHRcdGNhbGxiYWNrID0gXCJfZHVtbXlHU1wiOyAvL2lmIG5vIGNhbGxiYWNrIGlzIGRlZmluZWQsIHVzZSBhIGR1bW15IHZhbHVlIGp1c3Qgc28gdGhhdCB0aGUgY29uZGl0aW9uIGF0IHRoZSBlbmQgZXZhbHVhdGVzIGFzIHRydWUgYmVjYXVzZSBfc3RhcnRBdCBzaG91bGQgcmVuZGVyIEFGVEVSIHRoZSBub3JtYWwgcmVuZGVyIGxvb3Agd2hlbiB0aGUgdGltZSBpcyBuZWdhdGl2ZS4gV2UgY291bGQgaGFuZGxlIHRoaXMgaW4gYSBtb3JlIGludHVpdGl2ZSB3YXksIG9mIGNvdXJzZSwgYnV0IHRoZSByZW5kZXIgbG9vcCBpcyB0aGUgTU9TVCBpbXBvcnRhbnQgdGhpbmcgdG8gb3B0aW1pemUsIHNvIHRoaXMgdGVjaG5pcXVlIGFsbG93cyB1cyB0byBhdm9pZCBhZGRpbmcgZXh0cmEgY29uZGl0aW9uYWwgbG9naWMgaW4gYSBoaWdoLWZyZXF1ZW5jeSBhcmVhLlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy52YXJzLm9uU3RhcnQpIGlmICh0aGlzLl90aW1lICE9PSAwIHx8IGR1cmF0aW9uID09PSAwKSBpZiAoIXN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2FsbGJhY2soXCJvblN0YXJ0XCIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRwdCA9IHRoaXMuX2ZpcnN0UFQ7XG5cdFx0XHR3aGlsZSAocHQpIHtcblx0XHRcdFx0aWYgKHB0LmYpIHtcblx0XHRcdFx0XHRwdC50W3B0LnBdKHB0LmMgKiB0aGlzLnJhdGlvICsgcHQucyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHQudFtwdC5wXSA9IHB0LmMgKiB0aGlzLnJhdGlvICsgcHQucztcblx0XHRcdFx0fVxuXHRcdFx0XHRwdCA9IHB0Ll9uZXh0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fb25VcGRhdGUpIHtcblx0XHRcdFx0aWYgKHRpbWUgPCAwKSBpZiAodGhpcy5fc3RhcnRBdCAmJiB0aW1lICE9PSAtMC4wMDAxKSB7IC8vaWYgdGhlIHR3ZWVuIGlzIHBvc2l0aW9uZWQgYXQgdGhlIFZFUlkgYmVnaW5uaW5nIChfc3RhcnRUaW1lIDApIG9mIGl0cyBwYXJlbnQgdGltZWxpbmUsIGl0J3MgaWxsZWdhbCBmb3IgdGhlIHBsYXloZWFkIHRvIGdvIGJhY2sgZnVydGhlciwgc28gd2Ugc2hvdWxkIG5vdCByZW5kZXIgdGhlIHJlY29yZGVkIHN0YXJ0QXQgdmFsdWVzLlxuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0QXQucmVuZGVyKHRpbWUsIHN1cHByZXNzRXZlbnRzLCBmb3JjZSk7IC8vbm90ZTogZm9yIHBlcmZvcm1hbmNlIHJlYXNvbnMsIHdlIHR1Y2sgdGhpcyBjb25kaXRpb25hbCBsb2dpYyBpbnNpZGUgbGVzcyB0cmF2ZWxlZCBhcmVhcyAobW9zdCB0d2VlbnMgZG9uJ3QgaGF2ZSBhbiBvblVwZGF0ZSkuIFdlJ2QganVzdCBoYXZlIGl0IGF0IHRoZSBlbmQgYmVmb3JlIHRoZSBvbkNvbXBsZXRlLCBidXQgdGhlIHZhbHVlcyBzaG91bGQgYmUgdXBkYXRlZCBiZWZvcmUgYW55IG9uVXBkYXRlIGlzIGNhbGxlZCwgc28gd2UgQUxTTyBwdXQgaXQgaGVyZSBhbmQgdGhlbiBpZiBpdCdzIG5vdCBjYWxsZWQsIHdlIGRvIHNvIGxhdGVyIG5lYXIgdGhlIG9uQ29tcGxldGUuXG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFzdXBwcmVzc0V2ZW50cykgaWYgKHRoaXMuX3RpbWUgIT09IHByZXZUaW1lIHx8IGlzQ29tcGxldGUpIHtcblx0XHRcdFx0XHR0aGlzLl9jYWxsYmFjayhcIm9uVXBkYXRlXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2FsbGJhY2spIGlmICghdGhpcy5fZ2MgfHwgZm9yY2UpIHsgLy9jaGVjayBfZ2MgYmVjYXVzZSB0aGVyZSdzIGEgY2hhbmNlIHRoYXQga2lsbCgpIGNvdWxkIGJlIGNhbGxlZCBpbiBhbiBvblVwZGF0ZVxuXHRcdFx0XHRpZiAodGltZSA8IDAgJiYgdGhpcy5fc3RhcnRBdCAmJiAhdGhpcy5fb25VcGRhdGUgJiYgdGltZSAhPT0gLTAuMDAwMSkgeyAvLy0wLjAwMDEgaXMgYSBzcGVjaWFsIHZhbHVlIHRoYXQgd2UgdXNlIHdoZW4gbG9vcGluZyBiYWNrIHRvIHRoZSBiZWdpbm5pbmcgb2YgYSByZXBlYXRlZCBUaW1lbGluZU1heCwgaW4gd2hpY2ggY2FzZSB3ZSBzaG91bGRuJ3QgcmVuZGVyIHRoZSBfc3RhcnRBdCB2YWx1ZXMuXG5cdFx0XHRcdFx0dGhpcy5fc3RhcnRBdC5yZW5kZXIodGltZSwgc3VwcHJlc3NFdmVudHMsIGZvcmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl90aW1lbGluZS5hdXRvUmVtb3ZlQ2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2VuYWJsZWQoZmFsc2UsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFzdXBwcmVzc0V2ZW50cyAmJiB0aGlzLnZhcnNbY2FsbGJhY2tdKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2FsbGJhY2soY2FsbGJhY2spO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkdXJhdGlvbiA9PT0gMCAmJiB0aGlzLl9yYXdQcmV2VGltZSA9PT0gX3RpbnlOdW0gJiYgcmF3UHJldlRpbWUgIT09IF90aW55TnVtKSB7IC8vdGhlIG9uQ29tcGxldGUgb3Igb25SZXZlcnNlQ29tcGxldGUgY291bGQgdHJpZ2dlciBtb3ZlbWVudCBvZiB0aGUgcGxheWhlYWQgYW5kIGZvciB6ZXJvLWR1cmF0aW9uIHR3ZWVucyAod2hpY2ggbXVzdCBkaXNjZXJuIGRpcmVjdGlvbikgdGhhdCBsYW5kIGRpcmVjdGx5IGJhY2sgb24gdGhlaXIgc3RhcnQgdGltZSwgd2UgZG9uJ3Qgd2FudCB0byBmaXJlIGFnYWluIG9uIHRoZSBuZXh0IHJlbmRlci4gVGhpbmsgb2Ygc2V2ZXJhbCBhZGRQYXVzZSgpJ3MgaW4gYSB0aW1lbGluZSB0aGF0IGZvcmNlcyB0aGUgcGxheWhlYWQgdG8gYSBjZXJ0YWluIHNwb3QsIGJ1dCB3aGF0IGlmIGl0J3MgYWxyZWFkeSBwYXVzZWQgYW5kIGFub3RoZXIgdHdlZW4gaXMgdHdlZW5pbmcgdGhlIFwidGltZVwiIG9mIHRoZSB0aW1lbGluZT8gRWFjaCB0aW1lIGl0IG1vdmVzIFtmb3J3YXJkXSBwYXN0IHRoYXQgc3BvdCwgaXQgd291bGQgbW92ZSBiYWNrLCBhbmQgc2luY2Ugc3VwcHJlc3NFdmVudHMgaXMgdHJ1ZSwgaXQnZCByZXNldCBfcmF3UHJldlRpbWUgdG8gX3RpbnlOdW0gc28gdGhhdCB3aGVuIGl0IGJlZ2lucyBhZ2FpbiwgdGhlIGNhbGxiYWNrIHdvdWxkIGZpcmUgKHNvIHVsdGltYXRlbHkgaXQgY291bGQgYm91bmNlIGJhY2sgYW5kIGZvcnRoIGR1cmluZyB0aGF0IHR3ZWVuKS4gQWdhaW4sIHRoaXMgaXMgYSB2ZXJ5IHVuY29tbW9uIHNjZW5hcmlvLCBidXQgcG9zc2libGUgbm9uZXRoZWxlc3MuXG5cdFx0XHRcdFx0dGhpcy5fcmF3UHJldlRpbWUgPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHAuX2tpbGwgPSBmdW5jdGlvbih2YXJzLCB0YXJnZXQsIG92ZXJ3cml0aW5nVHdlZW4pIHtcblx0XHRcdGlmICh2YXJzID09PSBcImFsbFwiKSB7XG5cdFx0XHRcdHZhcnMgPSBudWxsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZhcnMgPT0gbnVsbCkgaWYgKHRhcmdldCA9PSBudWxsIHx8IHRhcmdldCA9PT0gdGhpcy50YXJnZXQpIHtcblx0XHRcdFx0dGhpcy5fbGF6eSA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlZChmYWxzZSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0dGFyZ2V0ID0gKHR5cGVvZih0YXJnZXQpICE9PSBcInN0cmluZ1wiKSA/ICh0YXJnZXQgfHwgdGhpcy5fdGFyZ2V0cyB8fCB0aGlzLnRhcmdldCkgOiBUd2VlbkxpdGUuc2VsZWN0b3IodGFyZ2V0KSB8fCB0YXJnZXQ7XG5cdFx0XHR2YXIgc2ltdWx0YW5lb3VzT3ZlcndyaXRlID0gKG92ZXJ3cml0aW5nVHdlZW4gJiYgdGhpcy5fdGltZSAmJiBvdmVyd3JpdGluZ1R3ZWVuLl9zdGFydFRpbWUgPT09IHRoaXMuX3N0YXJ0VGltZSAmJiB0aGlzLl90aW1lbGluZSA9PT0gb3ZlcndyaXRpbmdUd2Vlbi5fdGltZWxpbmUpLFxuXHRcdFx0XHRpLCBvdmVyd3JpdHRlblByb3BzLCBwLCBwdCwgcHJvcExvb2t1cCwgY2hhbmdlZCwga2lsbFByb3BzLCByZWNvcmQsIGtpbGxlZDtcblx0XHRcdGlmICgoX2lzQXJyYXkodGFyZ2V0KSB8fCBfaXNTZWxlY3Rvcih0YXJnZXQpKSAmJiB0eXBlb2YodGFyZ2V0WzBdKSAhPT0gXCJudW1iZXJcIikge1xuXHRcdFx0XHRpID0gdGFyZ2V0Lmxlbmd0aDtcblx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2tpbGwodmFycywgdGFyZ2V0W2ldLCBvdmVyd3JpdGluZ1R3ZWVuKSkge1xuXHRcdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fdGFyZ2V0cykge1xuXHRcdFx0XHRcdGkgPSB0aGlzLl90YXJnZXRzLmxlbmd0aDtcblx0XHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHRcdGlmICh0YXJnZXQgPT09IHRoaXMuX3RhcmdldHNbaV0pIHtcblx0XHRcdFx0XHRcdFx0cHJvcExvb2t1cCA9IHRoaXMuX3Byb3BMb29rdXBbaV0gfHwge307XG5cdFx0XHRcdFx0XHRcdHRoaXMuX292ZXJ3cml0dGVuUHJvcHMgPSB0aGlzLl9vdmVyd3JpdHRlblByb3BzIHx8IFtdO1xuXHRcdFx0XHRcdFx0XHRvdmVyd3JpdHRlblByb3BzID0gdGhpcy5fb3ZlcndyaXR0ZW5Qcm9wc1tpXSA9IHZhcnMgPyB0aGlzLl9vdmVyd3JpdHRlblByb3BzW2ldIHx8IHt9IDogXCJhbGxcIjtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHRhcmdldCAhPT0gdGhpcy50YXJnZXQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvcExvb2t1cCA9IHRoaXMuX3Byb3BMb29rdXA7XG5cdFx0XHRcdFx0b3ZlcndyaXR0ZW5Qcm9wcyA9IHRoaXMuX292ZXJ3cml0dGVuUHJvcHMgPSB2YXJzID8gdGhpcy5fb3ZlcndyaXR0ZW5Qcm9wcyB8fCB7fSA6IFwiYWxsXCI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocHJvcExvb2t1cCkge1xuXHRcdFx0XHRcdGtpbGxQcm9wcyA9IHZhcnMgfHwgcHJvcExvb2t1cDtcblx0XHRcdFx0XHRyZWNvcmQgPSAodmFycyAhPT0gb3ZlcndyaXR0ZW5Qcm9wcyAmJiBvdmVyd3JpdHRlblByb3BzICE9PSBcImFsbFwiICYmIHZhcnMgIT09IHByb3BMb29rdXAgJiYgKHR5cGVvZih2YXJzKSAhPT0gXCJvYmplY3RcIiB8fCAhdmFycy5fdGVtcEtpbGwpKTsgLy9fdGVtcEtpbGwgaXMgYSBzdXBlci1zZWNyZXQgd2F5IHRvIGRlbGV0ZSBhIHBhcnRpY3VsYXIgdHdlZW5pbmcgcHJvcGVydHkgYnV0IE5PVCBoYXZlIGl0IHJlbWVtYmVyZWQgYXMgYW4gb2ZmaWNpYWwgb3ZlcndyaXR0ZW4gcHJvcGVydHkgKGxpa2UgaW4gQmV6aWVyUGx1Z2luKVxuXHRcdFx0XHRcdGlmIChvdmVyd3JpdGluZ1R3ZWVuICYmIChUd2VlbkxpdGUub25PdmVyd3JpdGUgfHwgdGhpcy52YXJzLm9uT3ZlcndyaXRlKSkge1xuXHRcdFx0XHRcdFx0Zm9yIChwIGluIGtpbGxQcm9wcykge1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvcExvb2t1cFtwXSkge1xuXHRcdFx0XHRcdFx0XHRcdGlmICgha2lsbGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRraWxsZWQgPSBbXTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0a2lsbGVkLnB1c2gocCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgoa2lsbGVkIHx8ICF2YXJzKSAmJiAhX29uT3ZlcndyaXRlKHRoaXMsIG92ZXJ3cml0aW5nVHdlZW4sIHRhcmdldCwga2lsbGVkKSkgeyAvL2lmIHRoZSBvbk92ZXJ3cml0ZSByZXR1cm5lZCBmYWxzZSwgdGhhdCBtZWFucyB0aGUgdXNlciB3YW50cyB0byBvdmVycmlkZSB0aGUgb3ZlcndyaXRpbmcgKGNhbmNlbCBpdCkuXG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRmb3IgKHAgaW4ga2lsbFByb3BzKSB7XG5cdFx0XHRcdFx0XHRpZiAoKHB0ID0gcHJvcExvb2t1cFtwXSkpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHNpbXVsdGFuZW91c092ZXJ3cml0ZSkgeyAvL2lmIGFub3RoZXIgdHdlZW4gb3ZlcndyaXRlcyB0aGlzIG9uZSBhbmQgdGhleSBib3RoIHN0YXJ0IGF0IGV4YWN0bHkgdGhlIHNhbWUgdGltZSwgeWV0IHRoaXMgdHdlZW4gaGFzIGFscmVhZHkgcmVuZGVyZWQgb25jZSAoZm9yIGV4YW1wbGUsIGF0IDAuMDAxKSBiZWNhdXNlIGl0J3MgZmlyc3QgaW4gdGhlIHF1ZXVlLCB3ZSBzaG91bGQgcmV2ZXJ0IHRoZSB2YWx1ZXMgdG8gd2hlcmUgdGhleSB3ZXJlIGF0IDAgc28gdGhhdCB0aGUgc3RhcnRpbmcgdmFsdWVzIGFyZW4ndCBjb250YW1pbmF0ZWQgb24gdGhlIG92ZXJ3cml0aW5nIHR3ZWVuLlxuXHRcdFx0XHRcdFx0XHRcdGlmIChwdC5mKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRwdC50W3B0LnBdKHB0LnMpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRwdC50W3B0LnBdID0gcHQucztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKHB0LnBnICYmIHB0LnQuX2tpbGwoa2lsbFByb3BzKSkge1xuXHRcdFx0XHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlOyAvL3NvbWUgcGx1Z2lucyBuZWVkIHRvIGJlIG5vdGlmaWVkIHNvIHRoZXkgY2FuIHBlcmZvcm0gY2xlYW51cCB0YXNrcyBmaXJzdFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICghcHQucGcgfHwgcHQudC5fb3ZlcndyaXRlUHJvcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHB0Ll9wcmV2KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRwdC5fcHJldi5fbmV4dCA9IHB0Ll9uZXh0O1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocHQgPT09IHRoaXMuX2ZpcnN0UFQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX2ZpcnN0UFQgPSBwdC5fbmV4dDtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHB0Ll9uZXh0KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRwdC5fbmV4dC5fcHJldiA9IHB0Ll9wcmV2O1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRwdC5fbmV4dCA9IHB0Ll9wcmV2ID0gbnVsbDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRkZWxldGUgcHJvcExvb2t1cFtwXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChyZWNvcmQpIHtcblx0XHRcdFx0XHRcdFx0b3ZlcndyaXR0ZW5Qcm9wc1twXSA9IDE7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghdGhpcy5fZmlyc3RQVCAmJiB0aGlzLl9pbml0dGVkKSB7IC8vaWYgYWxsIHR3ZWVuaW5nIHByb3BlcnRpZXMgYXJlIGtpbGxlZCwga2lsbCB0aGUgdHdlZW4uIFdpdGhvdXQgdGhpcyBsaW5lLCBpZiB0aGVyZSdzIGEgdHdlZW4gd2l0aCBtdWx0aXBsZSB0YXJnZXRzIGFuZCB0aGVuIHlvdSBraWxsVHdlZW5zT2YoKSBlYWNoIHRhcmdldCBpbmRpdmlkdWFsbHksIHRoZSB0d2VlbiB3b3VsZCB0ZWNobmljYWxseSBzdGlsbCByZW1haW4gYWN0aXZlIGFuZCBmaXJlIGl0cyBvbkNvbXBsZXRlIGV2ZW4gdGhvdWdoIHRoZXJlIGFyZW4ndCBhbnkgbW9yZSBwcm9wZXJ0aWVzIHR3ZWVuaW5nLlxuXHRcdFx0XHRcdFx0dGhpcy5fZW5hYmxlZChmYWxzZSwgZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNoYW5nZWQ7XG5cdFx0fTtcblxuXHRcdHAuaW52YWxpZGF0ZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0aWYgKHRoaXMuX25vdGlmeVBsdWdpbnNPZkVuYWJsZWQpIHtcblx0XHRcdFx0VHdlZW5MaXRlLl9vblBsdWdpbkV2ZW50KFwiX29uRGlzYWJsZVwiLCB0aGlzKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2ZpcnN0UFQgPSB0aGlzLl9vdmVyd3JpdHRlblByb3BzID0gdGhpcy5fc3RhcnRBdCA9IHRoaXMuX29uVXBkYXRlID0gbnVsbDtcblx0XHRcdHRoaXMuX25vdGlmeVBsdWdpbnNPZkVuYWJsZWQgPSB0aGlzLl9hY3RpdmUgPSB0aGlzLl9sYXp5ID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9wcm9wTG9va3VwID0gKHRoaXMuX3RhcmdldHMpID8ge30gOiBbXTtcblx0XHRcdEFuaW1hdGlvbi5wcm90b3R5cGUuaW52YWxpZGF0ZS5jYWxsKHRoaXMpO1xuXHRcdFx0aWYgKHRoaXMudmFycy5pbW1lZGlhdGVSZW5kZXIpIHtcblx0XHRcdFx0dGhpcy5fdGltZSA9IC1fdGlueU51bTsgLy9mb3JjZXMgYSByZW5kZXIgd2l0aG91dCBoYXZpbmcgdG8gc2V0IHRoZSByZW5kZXIoKSBcImZvcmNlXCIgcGFyYW1ldGVyIHRvIHRydWUgYmVjYXVzZSB3ZSB3YW50IHRvIGFsbG93IGxhenlpbmcgYnkgZGVmYXVsdCAodXNpbmcgdGhlIFwiZm9yY2VcIiBwYXJhbWV0ZXIgYWx3YXlzIGZvcmNlcyBhbiBpbW1lZGlhdGUgZnVsbCByZW5kZXIpXG5cdFx0XHRcdHRoaXMucmVuZGVyKC10aGlzLl9kZWxheSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9O1xuXG5cdFx0cC5fZW5hYmxlZCA9IGZ1bmN0aW9uKGVuYWJsZWQsIGlnbm9yZVRpbWVsaW5lKSB7XG5cdFx0XHRpZiAoIV90aWNrZXJBY3RpdmUpIHtcblx0XHRcdFx0X3RpY2tlci53YWtlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW5hYmxlZCAmJiB0aGlzLl9nYykge1xuXHRcdFx0XHR2YXIgdGFyZ2V0cyA9IHRoaXMuX3RhcmdldHMsXG5cdFx0XHRcdFx0aTtcblx0XHRcdFx0aWYgKHRhcmdldHMpIHtcblx0XHRcdFx0XHRpID0gdGFyZ2V0cy5sZW5ndGg7XG5cdFx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zaWJsaW5nc1tpXSA9IF9yZWdpc3Rlcih0YXJnZXRzW2ldLCB0aGlzLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc2libGluZ3MgPSBfcmVnaXN0ZXIodGhpcy50YXJnZXQsIHRoaXMsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRBbmltYXRpb24ucHJvdG90eXBlLl9lbmFibGVkLmNhbGwodGhpcywgZW5hYmxlZCwgaWdub3JlVGltZWxpbmUpO1xuXHRcdFx0aWYgKHRoaXMuX25vdGlmeVBsdWdpbnNPZkVuYWJsZWQpIGlmICh0aGlzLl9maXJzdFBUKSB7XG5cdFx0XHRcdHJldHVybiBUd2VlbkxpdGUuX29uUGx1Z2luRXZlbnQoKGVuYWJsZWQgPyBcIl9vbkVuYWJsZVwiIDogXCJfb25EaXNhYmxlXCIpLCB0aGlzKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cbi8vLS0tLVR3ZWVuTGl0ZSBzdGF0aWMgbWV0aG9kcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdFx0VHdlZW5MaXRlLnRvID0gZnVuY3Rpb24odGFyZ2V0LCBkdXJhdGlvbiwgdmFycykge1xuXHRcdFx0cmV0dXJuIG5ldyBUd2VlbkxpdGUodGFyZ2V0LCBkdXJhdGlvbiwgdmFycyk7XG5cdFx0fTtcblxuXHRcdFR3ZWVuTGl0ZS5mcm9tID0gZnVuY3Rpb24odGFyZ2V0LCBkdXJhdGlvbiwgdmFycykge1xuXHRcdFx0dmFycy5ydW5CYWNrd2FyZHMgPSB0cnVlO1xuXHRcdFx0dmFycy5pbW1lZGlhdGVSZW5kZXIgPSAodmFycy5pbW1lZGlhdGVSZW5kZXIgIT0gZmFsc2UpO1xuXHRcdFx0cmV0dXJuIG5ldyBUd2VlbkxpdGUodGFyZ2V0LCBkdXJhdGlvbiwgdmFycyk7XG5cdFx0fTtcblxuXHRcdFR3ZWVuTGl0ZS5mcm9tVG8gPSBmdW5jdGlvbih0YXJnZXQsIGR1cmF0aW9uLCBmcm9tVmFycywgdG9WYXJzKSB7XG5cdFx0XHR0b1ZhcnMuc3RhcnRBdCA9IGZyb21WYXJzO1xuXHRcdFx0dG9WYXJzLmltbWVkaWF0ZVJlbmRlciA9ICh0b1ZhcnMuaW1tZWRpYXRlUmVuZGVyICE9IGZhbHNlICYmIGZyb21WYXJzLmltbWVkaWF0ZVJlbmRlciAhPSBmYWxzZSk7XG5cdFx0XHRyZXR1cm4gbmV3IFR3ZWVuTGl0ZSh0YXJnZXQsIGR1cmF0aW9uLCB0b1ZhcnMpO1xuXHRcdH07XG5cblx0XHRUd2VlbkxpdGUuZGVsYXllZENhbGwgPSBmdW5jdGlvbihkZWxheSwgY2FsbGJhY2ssIHBhcmFtcywgc2NvcGUsIHVzZUZyYW1lcykge1xuXHRcdFx0cmV0dXJuIG5ldyBUd2VlbkxpdGUoY2FsbGJhY2ssIDAsIHtkZWxheTpkZWxheSwgb25Db21wbGV0ZTpjYWxsYmFjaywgb25Db21wbGV0ZVBhcmFtczpwYXJhbXMsIGNhbGxiYWNrU2NvcGU6c2NvcGUsIG9uUmV2ZXJzZUNvbXBsZXRlOmNhbGxiYWNrLCBvblJldmVyc2VDb21wbGV0ZVBhcmFtczpwYXJhbXMsIGltbWVkaWF0ZVJlbmRlcjpmYWxzZSwgbGF6eTpmYWxzZSwgdXNlRnJhbWVzOnVzZUZyYW1lcywgb3ZlcndyaXRlOjB9KTtcblx0XHR9O1xuXG5cdFx0VHdlZW5MaXRlLnNldCA9IGZ1bmN0aW9uKHRhcmdldCwgdmFycykge1xuXHRcdFx0cmV0dXJuIG5ldyBUd2VlbkxpdGUodGFyZ2V0LCAwLCB2YXJzKTtcblx0XHR9O1xuXG5cdFx0VHdlZW5MaXRlLmdldFR3ZWVuc09mID0gZnVuY3Rpb24odGFyZ2V0LCBvbmx5QWN0aXZlKSB7XG5cdFx0XHRpZiAodGFyZ2V0ID09IG51bGwpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR0YXJnZXQgPSAodHlwZW9mKHRhcmdldCkgIT09IFwic3RyaW5nXCIpID8gdGFyZ2V0IDogVHdlZW5MaXRlLnNlbGVjdG9yKHRhcmdldCkgfHwgdGFyZ2V0O1xuXHRcdFx0dmFyIGksIGEsIGosIHQ7XG5cdFx0XHRpZiAoKF9pc0FycmF5KHRhcmdldCkgfHwgX2lzU2VsZWN0b3IodGFyZ2V0KSkgJiYgdHlwZW9mKHRhcmdldFswXSkgIT09IFwibnVtYmVyXCIpIHtcblx0XHRcdFx0aSA9IHRhcmdldC5sZW5ndGg7XG5cdFx0XHRcdGEgPSBbXTtcblx0XHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdFx0YSA9IGEuY29uY2F0KFR3ZWVuTGl0ZS5nZXRUd2VlbnNPZih0YXJnZXRbaV0sIG9ubHlBY3RpdmUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpID0gYS5sZW5ndGg7XG5cdFx0XHRcdC8vbm93IGdldCByaWQgb2YgYW55IGR1cGxpY2F0ZXMgKHR3ZWVucyBvZiBhcnJheXMgb2Ygb2JqZWN0cyBjb3VsZCBjYXVzZSBkdXBsaWNhdGVzKVxuXHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHR0ID0gYVtpXTtcblx0XHRcdFx0XHRqID0gaTtcblx0XHRcdFx0XHR3aGlsZSAoLS1qID4gLTEpIHtcblx0XHRcdFx0XHRcdGlmICh0ID09PSBhW2pdKSB7XG5cdFx0XHRcdFx0XHRcdGEuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YSA9IF9yZWdpc3Rlcih0YXJnZXQpLmNvbmNhdCgpO1xuXHRcdFx0XHRpID0gYS5sZW5ndGg7XG5cdFx0XHRcdHdoaWxlICgtLWkgPiAtMSkge1xuXHRcdFx0XHRcdGlmIChhW2ldLl9nYyB8fCAob25seUFjdGl2ZSAmJiAhYVtpXS5pc0FjdGl2ZSgpKSkge1xuXHRcdFx0XHRcdFx0YS5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYTtcblx0XHR9O1xuXG5cdFx0VHdlZW5MaXRlLmtpbGxUd2VlbnNPZiA9IFR3ZWVuTGl0ZS5raWxsRGVsYXllZENhbGxzVG8gPSBmdW5jdGlvbih0YXJnZXQsIG9ubHlBY3RpdmUsIHZhcnMpIHtcblx0XHRcdGlmICh0eXBlb2Yob25seUFjdGl2ZSkgPT09IFwib2JqZWN0XCIpIHtcblx0XHRcdFx0dmFycyA9IG9ubHlBY3RpdmU7IC8vZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IChiZWZvcmUgXCJvbmx5QWN0aXZlXCIgcGFyYW1ldGVyIHdhcyBpbnNlcnRlZClcblx0XHRcdFx0b25seUFjdGl2ZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dmFyIGEgPSBUd2VlbkxpdGUuZ2V0VHdlZW5zT2YodGFyZ2V0LCBvbmx5QWN0aXZlKSxcblx0XHRcdFx0aSA9IGEubGVuZ3RoO1xuXHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdGFbaV0uX2tpbGwodmFycywgdGFyZ2V0KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cblxuLypcbiAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqIFR3ZWVuUGx1Z2luICAgKGNvdWxkIGVhc2lseSBiZSBzcGxpdCBvdXQgYXMgYSBzZXBhcmF0ZSBmaWxlL2NsYXNzLCBidXQgaW5jbHVkZWQgZm9yIGVhc2Ugb2YgdXNlIChzbyB0aGF0IHBlb3BsZSBkb24ndCBuZWVkIHRvIGluY2x1ZGUgYW5vdGhlciBzY3JpcHQgY2FsbCBiZWZvcmUgbG9hZGluZyBwbHVnaW5zIHdoaWNoIGlzIGVhc3kgdG8gZm9yZ2V0KVxuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICovXG5cdFx0dmFyIFR3ZWVuUGx1Z2luID0gX2NsYXNzKFwicGx1Z2lucy5Ud2VlblBsdWdpblwiLCBmdW5jdGlvbihwcm9wcywgcHJpb3JpdHkpIHtcblx0XHRcdFx0XHR0aGlzLl9vdmVyd3JpdGVQcm9wcyA9IChwcm9wcyB8fCBcIlwiKS5zcGxpdChcIixcIik7XG5cdFx0XHRcdFx0dGhpcy5fcHJvcE5hbWUgPSB0aGlzLl9vdmVyd3JpdGVQcm9wc1swXTtcblx0XHRcdFx0XHR0aGlzLl9wcmlvcml0eSA9IHByaW9yaXR5IHx8IDA7XG5cdFx0XHRcdFx0dGhpcy5fc3VwZXIgPSBUd2VlblBsdWdpbi5wcm90b3R5cGU7XG5cdFx0XHRcdH0sIHRydWUpO1xuXG5cdFx0cCA9IFR3ZWVuUGx1Z2luLnByb3RvdHlwZTtcblx0XHRUd2VlblBsdWdpbi52ZXJzaW9uID0gXCIxLjE4LjBcIjtcblx0XHRUd2VlblBsdWdpbi5BUEkgPSAyO1xuXHRcdHAuX2ZpcnN0UFQgPSBudWxsO1xuXHRcdHAuX2FkZFR3ZWVuID0gX2FkZFByb3BUd2Vlbjtcblx0XHRwLnNldFJhdGlvID0gX3NldFJhdGlvO1xuXG5cdFx0cC5fa2lsbCA9IGZ1bmN0aW9uKGxvb2t1cCkge1xuXHRcdFx0dmFyIGEgPSB0aGlzLl9vdmVyd3JpdGVQcm9wcyxcblx0XHRcdFx0cHQgPSB0aGlzLl9maXJzdFBULFxuXHRcdFx0XHRpO1xuXHRcdFx0aWYgKGxvb2t1cFt0aGlzLl9wcm9wTmFtZV0gIT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLl9vdmVyd3JpdGVQcm9wcyA9IFtdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aSA9IGEubGVuZ3RoO1xuXHRcdFx0XHR3aGlsZSAoLS1pID4gLTEpIHtcblx0XHRcdFx0XHRpZiAobG9va3VwW2FbaV1dICE9IG51bGwpIHtcblx0XHRcdFx0XHRcdGEuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0d2hpbGUgKHB0KSB7XG5cdFx0XHRcdGlmIChsb29rdXBbcHQubl0gIT0gbnVsbCkge1xuXHRcdFx0XHRcdGlmIChwdC5fbmV4dCkge1xuXHRcdFx0XHRcdFx0cHQuX25leHQuX3ByZXYgPSBwdC5fcHJldjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHB0Ll9wcmV2KSB7XG5cdFx0XHRcdFx0XHRwdC5fcHJldi5fbmV4dCA9IHB0Ll9uZXh0O1xuXHRcdFx0XHRcdFx0cHQuX3ByZXYgPSBudWxsO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fZmlyc3RQVCA9PT0gcHQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcnN0UFQgPSBwdC5fbmV4dDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cHQgPSBwdC5fbmV4dDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0cC5fcm91bmRQcm9wcyA9IGZ1bmN0aW9uKGxvb2t1cCwgdmFsdWUpIHtcblx0XHRcdHZhciBwdCA9IHRoaXMuX2ZpcnN0UFQ7XG5cdFx0XHR3aGlsZSAocHQpIHtcblx0XHRcdFx0aWYgKGxvb2t1cFt0aGlzLl9wcm9wTmFtZV0gfHwgKHB0Lm4gIT0gbnVsbCAmJiBsb29rdXBbIHB0Lm4uc3BsaXQodGhpcy5fcHJvcE5hbWUgKyBcIl9cIikuam9pbihcIlwiKSBdKSkgeyAvL3NvbWUgcHJvcGVydGllcyB0aGF0IGFyZSB2ZXJ5IHBsdWdpbi1zcGVjaWZpYyBhZGQgYSBwcmVmaXggbmFtZWQgYWZ0ZXIgdGhlIF9wcm9wTmFtZSBwbHVzIGFuIHVuZGVyc2NvcmUsIHNvIHdlIG5lZWQgdG8gaWdub3JlIHRoYXQgZXh0cmEgc3R1ZmYgaGVyZS5cblx0XHRcdFx0XHRwdC5yID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHQgPSBwdC5fbmV4dDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0VHdlZW5MaXRlLl9vblBsdWdpbkV2ZW50ID0gZnVuY3Rpb24odHlwZSwgdHdlZW4pIHtcblx0XHRcdHZhciBwdCA9IHR3ZWVuLl9maXJzdFBULFxuXHRcdFx0XHRjaGFuZ2VkLCBwdDIsIGZpcnN0LCBsYXN0LCBuZXh0O1xuXHRcdFx0aWYgKHR5cGUgPT09IFwiX29uSW5pdEFsbFByb3BzXCIpIHtcblx0XHRcdFx0Ly9zb3J0cyB0aGUgUHJvcFR3ZWVuIGxpbmtlZCBsaXN0IGluIG9yZGVyIG9mIHByaW9yaXR5IGJlY2F1c2Ugc29tZSBwbHVnaW5zIG5lZWQgdG8gcmVuZGVyIGVhcmxpZXIvbGF0ZXIgdGhhbiBvdGhlcnMsIGxpa2UgTW90aW9uQmx1clBsdWdpbiBhcHBsaWVzIGl0cyBlZmZlY3RzIGFmdGVyIGFsbCB4L3kvYWxwaGEgdHdlZW5zIGhhdmUgcmVuZGVyZWQgb24gZWFjaCBmcmFtZS5cblx0XHRcdFx0d2hpbGUgKHB0KSB7XG5cdFx0XHRcdFx0bmV4dCA9IHB0Ll9uZXh0O1xuXHRcdFx0XHRcdHB0MiA9IGZpcnN0O1xuXHRcdFx0XHRcdHdoaWxlIChwdDIgJiYgcHQyLnByID4gcHQucHIpIHtcblx0XHRcdFx0XHRcdHB0MiA9IHB0Mi5fbmV4dDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKChwdC5fcHJldiA9IHB0MiA/IHB0Mi5fcHJldiA6IGxhc3QpKSB7XG5cdFx0XHRcdFx0XHRwdC5fcHJldi5fbmV4dCA9IHB0O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRmaXJzdCA9IHB0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoKHB0Ll9uZXh0ID0gcHQyKSkge1xuXHRcdFx0XHRcdFx0cHQyLl9wcmV2ID0gcHQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGxhc3QgPSBwdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHQgPSBuZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHB0ID0gdHdlZW4uX2ZpcnN0UFQgPSBmaXJzdDtcblx0XHRcdH1cblx0XHRcdHdoaWxlIChwdCkge1xuXHRcdFx0XHRpZiAocHQucGcpIGlmICh0eXBlb2YocHQudFt0eXBlXSkgPT09IFwiZnVuY3Rpb25cIikgaWYgKHB0LnRbdHlwZV0oKSkge1xuXHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHB0ID0gcHQuX25leHQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY2hhbmdlZDtcblx0XHR9O1xuXG5cdFx0VHdlZW5QbHVnaW4uYWN0aXZhdGUgPSBmdW5jdGlvbihwbHVnaW5zKSB7XG5cdFx0XHR2YXIgaSA9IHBsdWdpbnMubGVuZ3RoO1xuXHRcdFx0d2hpbGUgKC0taSA+IC0xKSB7XG5cdFx0XHRcdGlmIChwbHVnaW5zW2ldLkFQSSA9PT0gVHdlZW5QbHVnaW4uQVBJKSB7XG5cdFx0XHRcdFx0X3BsdWdpbnNbKG5ldyBwbHVnaW5zW2ldKCkpLl9wcm9wTmFtZV0gPSBwbHVnaW5zW2ldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9O1xuXG5cdFx0Ly9wcm92aWRlcyBhIG1vcmUgY29uY2lzZSB3YXkgdG8gZGVmaW5lIHBsdWdpbnMgdGhhdCBoYXZlIG5vIGRlcGVuZGVuY2llcyBiZXNpZGVzIFR3ZWVuUGx1Z2luIGFuZCBUd2VlbkxpdGUsIHdyYXBwaW5nIGNvbW1vbiBib2lsZXJwbGF0ZSBzdHVmZiBpbnRvIG9uZSBmdW5jdGlvbiAoYWRkZWQgaW4gMS45LjApLiBZb3UgZG9uJ3QgTkVFRCB0byB1c2UgdGhpcyB0byBkZWZpbmUgYSBwbHVnaW4gLSB0aGUgb2xkIHdheSBzdGlsbCB3b3JrcyBhbmQgY2FuIGJlIHVzZWZ1bCBpbiBjZXJ0YWluIChyYXJlKSBzaXR1YXRpb25zLlxuXHRcdF9nc0RlZmluZS5wbHVnaW4gPSBmdW5jdGlvbihjb25maWcpIHtcblx0XHRcdGlmICghY29uZmlnIHx8ICFjb25maWcucHJvcE5hbWUgfHwgIWNvbmZpZy5pbml0IHx8ICFjb25maWcuQVBJKSB7IHRocm93IFwiaWxsZWdhbCBwbHVnaW4gZGVmaW5pdGlvbi5cIjsgfVxuXHRcdFx0dmFyIHByb3BOYW1lID0gY29uZmlnLnByb3BOYW1lLFxuXHRcdFx0XHRwcmlvcml0eSA9IGNvbmZpZy5wcmlvcml0eSB8fCAwLFxuXHRcdFx0XHRvdmVyd3JpdGVQcm9wcyA9IGNvbmZpZy5vdmVyd3JpdGVQcm9wcyxcblx0XHRcdFx0bWFwID0ge2luaXQ6XCJfb25Jbml0VHdlZW5cIiwgc2V0Olwic2V0UmF0aW9cIiwga2lsbDpcIl9raWxsXCIsIHJvdW5kOlwiX3JvdW5kUHJvcHNcIiwgaW5pdEFsbDpcIl9vbkluaXRBbGxQcm9wc1wifSxcblx0XHRcdFx0UGx1Z2luID0gX2NsYXNzKFwicGx1Z2lucy5cIiArIHByb3BOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcHJvcE5hbWUuc3Vic3RyKDEpICsgXCJQbHVnaW5cIixcblx0XHRcdFx0XHRmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdFR3ZWVuUGx1Z2luLmNhbGwodGhpcywgcHJvcE5hbWUsIHByaW9yaXR5KTtcblx0XHRcdFx0XHRcdHRoaXMuX292ZXJ3cml0ZVByb3BzID0gb3ZlcndyaXRlUHJvcHMgfHwgW107XG5cdFx0XHRcdFx0fSwgKGNvbmZpZy5nbG9iYWwgPT09IHRydWUpKSxcblx0XHRcdFx0cCA9IFBsdWdpbi5wcm90b3R5cGUgPSBuZXcgVHdlZW5QbHVnaW4ocHJvcE5hbWUpLFxuXHRcdFx0XHRwcm9wO1xuXHRcdFx0cC5jb25zdHJ1Y3RvciA9IFBsdWdpbjtcblx0XHRcdFBsdWdpbi5BUEkgPSBjb25maWcuQVBJO1xuXHRcdFx0Zm9yIChwcm9wIGluIG1hcCkge1xuXHRcdFx0XHRpZiAodHlwZW9mKGNvbmZpZ1twcm9wXSkgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRcdHBbbWFwW3Byb3BdXSA9IGNvbmZpZ1twcm9wXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0UGx1Z2luLnZlcnNpb24gPSBjb25maWcudmVyc2lvbjtcblx0XHRcdFR3ZWVuUGx1Z2luLmFjdGl2YXRlKFtQbHVnaW5dKTtcblx0XHRcdHJldHVybiBQbHVnaW47XG5cdFx0fTtcblxuXG5cdFx0Ly9ub3cgcnVuIHRocm91Z2ggYWxsIHRoZSBkZXBlbmRlbmNpZXMgZGlzY292ZXJlZCBhbmQgaWYgYW55IGFyZSBtaXNzaW5nLCBsb2cgdGhhdCB0byB0aGUgY29uc29sZSBhcyBhIHdhcm5pbmcuIFRoaXMgaXMgd2h5IGl0J3MgYmVzdCB0byBoYXZlIFR3ZWVuTGl0ZSBsb2FkIGxhc3QgLSBpdCBjYW4gY2hlY2sgYWxsIHRoZSBkZXBlbmRlbmNpZXMgZm9yIHlvdS5cblx0XHRhID0gd2luZG93Ll9nc1F1ZXVlO1xuXHRcdGlmIChhKSB7XG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRhW2ldKCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKHAgaW4gX2RlZkxvb2t1cCkge1xuXHRcdFx0XHRpZiAoIV9kZWZMb29rdXBbcF0uZnVuYykge1xuXHRcdFx0XHRcdHdpbmRvdy5jb25zb2xlLmxvZyhcIkdTQVAgZW5jb3VudGVyZWQgbWlzc2luZyBkZXBlbmRlbmN5OiBjb20uZ3JlZW5zb2NrLlwiICsgcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRfdGlja2VyQWN0aXZlID0gZmFsc2U7IC8vZW5zdXJlcyB0aGF0IHRoZSBmaXJzdCBvZmZpY2lhbCBhbmltYXRpb24gZm9yY2VzIGEgdGlja2VyLnRpY2soKSB0byB1cGRhdGUgdGhlIHRpbWUgd2hlbiBpdCBpcyBpbnN0YW50aWF0ZWRcblxufSkoKHR5cGVvZihtb2R1bGUpICE9PSBcInVuZGVmaW5lZFwiICYmIG1vZHVsZS5leHBvcnRzICYmIHR5cGVvZihnbG9iYWwpICE9PSBcInVuZGVmaW5lZFwiKSA/IGdsb2JhbCA6IHRoaXMgfHwgd2luZG93LCBcIlR3ZWVuTGl0ZVwiKTsiLCIhZnVuY3Rpb24oKXt2YXIgbj1mdW5jdGlvbih0KXtyZXR1cm4gbmV3IG4uZm4uaW5pdCh0KX07bi5lYWNoPWZ1bmN0aW9uKG4sdCl7Zm9yKHZhciByPTA7cjxuLmxlbmd0aDtyKyspdChyLG5bcl0pfSxuLmZuPW4ucHJvdG90eXBlPXtpbml0OmZ1bmN0aW9uKG4pe3ZhciB0PWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwobil8fFtdO3JldHVybiB0aGlzLnNlbGVjdG9yPXQubGVuZ3RoPjE/dDp0WzBdLHRoaXN9LGNzczpmdW5jdGlvbihuKXt2YXIgdD17XCJiYWNrZ3JvdW5kLWltYWdlXCI6XCJiYWNrZ3JvdW5kSW1hZ2VcIixcImJhY2tncm91bmQtcG9zaXRpb25cIjpcImJhY2tncm91bmRQb3NpdGlvblwifTtmb3IodmFyIHIgaW4gbilpZihuLmhhc093blByb3BlcnR5KHIpKXt2YXIgZT1uW3JdO3QuaGFzT3duUHJvcGVydHkocik/dGhpcy5zZWxlY3Rvci5zdHlsZVt0W3JdXT1lOnRoaXMuc2VsZWN0b3Iuc3R5bGVbcl09ZX19LG9uOmZ1bmN0aW9uKG4sdCl7cmV0dXJuIHRoaXMuc2VsZWN0b3IuYWRkRXZlbnRMaXN0ZW5lcihuLHQsITEpLHRoaXN9fSxuLmZuLmluaXQucHJvdG90eXBlPW4uZm4sd2luZG93LmdRdWVyeT13aW5kb3cuJD1ufSgpO1xuIiwiLy9NYWluIEpTIGZpbGVcbnZhciBnUXVlcnkgPSByZXF1aXJlKCcuL2xpYnMvZ3F1ZXJ5L2Rpc3QvZ3F1ZXJ5Lm1pbi5qcycpLFxuICAgIFVUSUwgPSByZXF1aXJlKCcuL3V0aWwuanMnKSxcbiAgICBUd2VlbkxpdGUgPSByZXF1aXJlKCcuL2xpYnMvVHdlZW5MaXRlLmpzJyksXG4gICAgVGltZWxpbmVMaXRlID0gcmVxdWlyZSgnLi9saWJzL1RpbWVsaW5lTGl0ZS5qcycpLFxuICAgIENTU1BsdWdpbiA9IHJlcXVpcmUoJy4vbGlicy9DU1NQbHVnaW4uanMnKSxcbiAgICBlYXNlUGFjayA9IHJlcXVpcmUoJy4vbGlicy9FYXNlUGFjay5qcycpO1xuLy9Zb3UgY2FuIHVzZSAkKCcuY2xhc3MnKS5zZWxlY3RvciBvciAkKCcjaWQnKS5zZWxlY3RvciBmb3Jcbi8valF1ZXJ5LWxpa2Ugd29ya2Zsb3cuICQuZWFjaChzZWxlY3RvciwgY2FsbGJhY2spLCAkLmNzcyh7T2JqZWN0fSksXG4vLyQub24oZXZlbnRUeXBlLCBjYWxsYmFjaykuIEdyZWVuc29jayBUd2VlbkxpdGUgYW5kIFRpbWVsaW5lTGl0ZVxuLy9hcmUgYWxzbyBpbmNsdWRlZC5cbnZhciBBbmltYXRpb25zID0gKGZ1bmN0aW9uICgpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgdGltZWxpbmUsXHRcdFx0Ly8gTWFpbiBBbmltYXRpb24gdGhhdCBob2xkIHRoZSBjaGlsZCBhbmltYXRpb25zXG4gICAgICAgIHZhcmlhbnQsXHRcdFx0Ly8gc3R5bGUuLi4gbXB1IC8gbGVhZGVyYm9hcmQgZXRjXG4gICAgICAgIGVsZW1lbnRzID0ge30sIFx0XHQvLyBIb21lIG9mIGFsbCBvZiB0aGUgRE9NIE5vZGUgRWxlbWVudHNcbiAgICAgICAgYmFja2dyb3VuZHMgPSB7fTtcdC8vIEp1c3QgYW5vdGhlciBoYW5keSBjb250YWluZXJcblxuICAgIC8vIENvbnN0cnVjdFxuICAgIGZ1bmN0aW9uIEFuaW1hdGlvbnMgKCkge1xuXG4gICAgfVxuXG4gICAgLy8gVGhpcyBjcmVhdGVzIGFsbCBvZiBvdXIgYW5pbWF0aW9uIGVsZW1lbnRzXG4gICAgQW5pbWF0aW9ucy5wcm90b3R5cGUuYXNzaWduID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBlbGVtZW50cy5hZCAgICAgXHQ9ICQoJy5hZCcpLnNlbGVjdG9yO1xuICAgICAgICBlbGVtZW50cy5maXJzdCBcdFx0PSAkKCcjZWxlbWVudC0xJykuc2VsZWN0b3I7XG4gICAgICAgIGVsZW1lbnRzLnNlY29uZCBcdD0gJCgnI2VsZW1lbnQtMicpLnNlbGVjdG9yO1xuICAgICAgICBlbGVtZW50cy50aGlyZCBcdFx0PSAkKCcjZWxlbWVudC0zJykuc2VsZWN0b3I7XG4gICAgICAgIGVsZW1lbnRzLmZvdXJ0aCBcdD0gJCgnI2VsZW1lbnQtNCcpLnNlbGVjdG9yO1xuICAgICAgICBlbGVtZW50cy5jdGEgXHRcdD0gJCgnI2N0YScpLnNlbGVjdG9yO1xuICAgICAgICBlbGVtZW50cy5sb2dvIFx0XHQ9ICQoJyNsb2dvJykuc2VsZWN0b3I7XG5cbiAgICAgICAgdGhpcy5jb25zdHJ1Y3QoKTtcbiAgICB9O1xuXG4gICAgLy8gVGhpcyBjcmVhdGVzIGFsbCBvZiBvdXIgYW5pbWF0aW9uIGVsZW1lbnRzXG4gICAgQW5pbWF0aW9ucy5wcm90b3R5cGUuY29uc3RydWN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZHVyYXRpb25ab29tSW4gXHRcdD0gMSxcbiAgICAgICAgICAgIGR1cmF0aW9uWm9vbU91dCBcdD0gMSxcbiAgICAgICAgICAgIGR1cmF0aW9uRmFkZUluIFx0XHQ9IDEsXG4gICAgICAgICAgICBkdXJhdGlvbkZhZGVPdXQgXHQ9IDEsXG4gICAgICAgICAgICBwYXVzZUR1cmF0aW9uIFx0XHQ9IDI7XG5cbiAgICAgICAgLy8gY3JlYXRlIGEgaG9tZSBmb3Igb3VyIGFuaW1hdGlvbnNcbiAgICAgICAgLy8gdGltZWxpbmUgPSBuZXcgVGltZWxpbmVMaXRlKCB7b25Db21wbGV0ZTp0aGlzLm9uRmluaXNoLCBvbkNvbXBsZXRlUGFyYW1zOltcInRlc3QxXCIsIFwidGVzdDJcIl0sIG9uQ29tcGxldGVTY29wZTp0aGlzIH0gKTtcbiAgICAgICAgdGltZWxpbmUgPSBuZXcgVGltZWxpbmVMaXRlKCk7XG5cbiAgICAgICAgdmFyIHNjZW5lMSA9IG5ldyBUaW1lbGluZUxpdGUoKTtcbiAgICAgICAgLy8gRnJhbWUgIyAxIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgICAgLy8gRmFkZSBpblxuICAgICAgICBzY2VuZTEuZnJvbVRvKGVsZW1lbnRzLmZpcnN0LCBkdXJhdGlvbkZhZGVJbiwge2F1dG9BbHBoYTowfSwge2F1dG9BbHBoYToxfSk7XG4gICAgICAgIHNjZW5lMS50byhlbGVtZW50cy5maXJzdCwgZHVyYXRpb25GYWRlT3V0LCB7YXV0b0FscGhhOjB9LCAnKz0nK3BhdXNlRHVyYXRpb24pO1xuXG4gICAgICAgIHNjZW5lMS5mcm9tVG8oZWxlbWVudHMuc2Vjb25kLCBkdXJhdGlvbkZhZGVJbiwge2F1dG9BbHBoYTowfSwge2F1dG9BbHBoYToxfSk7XG4gICAgICAgIHNjZW5lMS50byhlbGVtZW50cy5zZWNvbmQsIGR1cmF0aW9uRmFkZU91dCwge2F1dG9BbHBoYTowfSwgJys9JytwYXVzZUR1cmF0aW9uKTtcblxuICAgICAgICB2YXIgc2NlbmUyID0gbmV3IFRpbWVsaW5lTGl0ZSgpO1xuICAgICAgICAvLyBGcmFtZSAjIDIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAvLyBGYWRlIGluXG4gICAgICAgIHNjZW5lMi5mcm9tVG8oZWxlbWVudHMudGhpcmQsIGR1cmF0aW9uRmFkZUluLCB7YXV0b0FscGhhOjB9LCB7YXV0b0FscGhhOjF9KTtcbiAgICAgICAgc2NlbmUyLnRvKGVsZW1lbnRzLnRoaXJkLCBkdXJhdGlvbkZhZGVPdXQsIHthdXRvQWxwaGE6MH0sICcrPScrcGF1c2VEdXJhdGlvbik7XG5cbiAgICAgICAgc2NlbmUyLmZyb21UbyhlbGVtZW50cy5mb3VydGgsIGR1cmF0aW9uRmFkZUluLCB7YXV0b0FscGhhOjB9LCB7YXV0b0FscGhhOjF9KTtcbiAgICAgICAgc2NlbmUyLnRvKGVsZW1lbnRzLmZvdXJ0aCwgZHVyYXRpb25GYWRlT3V0LCB7YXV0b0FscGhhOjB9LCAnKz0nK3BhdXNlRHVyYXRpb24pO1xuXG4gICAgICAgIHZhciBlbmRmcmFtZSA9IG5ldyBUaW1lbGluZUxpdGUoKTtcbiAgICAgICAgLy8gRW5kZnJhbWUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAvLyBGYWRlIGluXG4gICAgICAgIGVuZGZyYW1lLmZyb21UbyhlbGVtZW50cy5sb2dvLCBkdXJhdGlvbkZhZGVJbiwge2F1dG9BbHBoYTowfSwge2F1dG9BbHBoYToxfSk7XG5cbiAgICAgICAgZW5kZnJhbWUuZnJvbVRvKGVsZW1lbnRzLmN0YSwgZHVyYXRpb25GYWRlSW4sIHthdXRvQWxwaGE6MH0sIHthdXRvQWxwaGE6MX0pO1xuXG4gICAgICAgIC8vIENyZWF0ZSB0aW1lbGluZVxuICAgICAgICB0aW1lbGluZS5hZGQoc2NlbmUxKTtcbiAgICAgICAgdGltZWxpbmUuYWRkKHNjZW5lMik7XG4gICAgICAgIHRpbWVsaW5lLmFkZChlbmRmcmFtZSk7XG5cbiAgICAgICAgLy8gd2FpdCBiZWZvcmUgc3RhcnRpbmcgdGhlIGFuaW1hdGlvbiFcbiAgICAgICAgdGltZWxpbmUucGF1c2UoKTtcbiAgICB9O1xuXG4gICAgLy8gVGhpcyBLaWNrcyBvZmYgdGhlIGFuaW1hdGlvbiBvbiBzY3JlZW5cbiAgICBBbmltYXRpb25zLnByb3RvdHlwZS5vbkZpbmlzaCA9IGZ1bmN0aW9uIChzY29wZSkge1xuXG4gICAgfTtcblxuICAgIEFuaW1hdGlvbnMucHJvdG90eXBlLmJlZ2luID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBoaWRlIGxvYWRlciFcbiAgICAgICAgLy8gcmVtb3ZlIGxvYWRpbmcgY2xhc3MgZnJvbSAjY29udGVudFxuICAgICAgICBVVElMLnJlbW92ZUNsYXNzKGVsZW1lbnRzLmFkICwgJ2xvYWRpbmcnKTtcbiAgICAgICAgdGltZWxpbmUucGxheSgpO1xuICAgIH07XG5cbiAgICByZXR1cm4gQW5pbWF0aW9ucztcbn0pKCk7XG5cbndpbmRvdy5vbmxvYWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFuaW0gPSBuZXcgQW5pbWF0aW9ucygpO1xuXG4gICAgYW5pbS5hc3NpZ24oKTtcbiAgICBhbmltLmJlZ2luKCk7XG59O1xuIiwiLy8gR2xvYmFsIFV0aWxpdGllcyBmb3JcbnZhciBVVElMID0gVVRJTCB8fCB7fTtcblxuLy8gUG9seWZpbGxpbmcgQ2xhc3MgTWFuYWdlbWVudFxuVVRJTC5yZW1vdmVDbGFzcyA9IGZ1bmN0aW9uKGVsZW1lbnQsIGNsYXNzTmFtZSkge1xuICAgIGlmIChlbGVtZW50LmNsYXNzTGlzdCkgZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKGNsYXNzTmFtZSk7XG4gICAgZWxzZSBlbGVtZW50LmNsYXNzTmFtZSA9IGVsZW1lbnQuY2xhc3NOYW1lLnJlcGxhY2UobmV3IFJlZ0V4cCgnKF58XFxcXGIpJyArIGNsYXNzTmFtZS5zcGxpdCgnICcpLmpvaW4oJ3wnKSArICcoXFxcXGJ8JCknLCAnZ2knKSwgJyAnKTtcbn07XG5cblVUSUwuYWRkQ2xhc3MgPSBmdW5jdGlvbihlbGVtZW50LCBjbGFzc05hbWUpIHtcbiAgICBpZiAoZWxlbWVudC5jbGFzc0xpc3QpIGVsZW1lbnQuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuICAgIGVsc2UgZWxlbWVudC5jbGFzc05hbWUgKz0gJyAnICsgY2xhc3NOYW1lO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBVVElMO1xuIl19
