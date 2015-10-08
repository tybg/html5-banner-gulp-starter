// Global Utilities for
var UTIL = UTIL || {};

var versionSearchString = '',
    userAgent = navigator.userAgent,
    vendor = navigator.vendor,
    platform = navigator.platform,
    data = {
        prefixes: 'Webkit Moz O ms'.split(' '),
        engines: {
            applewebkit: 'webkit',
            safari: 'webkit',
            chrome: 'webkit',
            msie: 'trident',
            firefox: 'gecko',
            opera: 'webkit',
            opera_legacy: 'presto',
            adobeair: 'webkit'
        },
        browser: [{
            string: userAgent,
            subString: 'MSIE',
            identity: 'MSIE',
            versionSearch: 'MSIE'
        }, {
            string: userAgent,
            subString: 'Trident',
            identity: 'Trident',
            versionSearch: 'Trident'
        }, {
            string: userAgent,
            subString: 'OPR/',
            identity: 'Opera',
            versionSearch: 'OPR'
        }, {
            string: userAgent,
            subString: 'Chrome',
            identity: 'Chrome'
        }, {
            string: userAgent,
            subString: 'Opera',
            identity: 'opera_legacy',
            versionSearch: 'Version'
        }, {
            string: userAgent,
            subString: 'AdobeAIR',
            identity: 'AdobeAIR'
        }, {
            string: vendor,
            subString: 'Apple',
            identity: 'Safari',
            versionSearch: 'Version'
        }, {
            string: userAgent,
            subString: 'Firefox',
            identity: 'Firefox'
        }, {
            string: userAgent,
            subString: 'AppleWebKit',
            identity: 'AppleWebKit'
        }, {
            string: userAgent,
            subString: 'AppleWebkit',
            identity: 'AppleWebkit'
        }],
        os: [{
            string: platform,
            subString: 'Win',
            identity: 'Windows',
            version: function(string) {
                var matches = string.match(/Windows NT ([0-9.]+)/i);
                return matches ? parseFloat(matches[1]) : '';
            }
        }, {
            string: platform,
            subString: 'Mac',
            identity: 'Mac',
            version: appleOSVersionMatch
        }, {
            string: platform,
            subString: 'Android',
            identity: 'Android',
            version: function(string) {
                var matches = string.match(/Android ([0-9.]+)/i);
                return matches ? matches[1] : '';
            }
        }, {
            string: userAgent,
            subString: 'iPod',
            identity: 'iPod',
            version: appleOSVersionMatch
        }, {
            string: userAgent,
            subString: 'iPhone',
            identity: 'iPhone',
            version: appleOSVersionMatch
        }, {
            string: userAgent,
            subString: 'iPad',
            identity: 'iPad',
            version: appleOSVersionMatch
        }, {
            string: platform,
            subString: 'Linux',
            identity: 'Linux'
        }],
        transitionEndEventNames: {
            webkit: 'webkitTransitionEnd',
            gecko: 'transitionend',
            presto: 'oTransitionEnd',
            trident: 'transitionend'
        },
        animationEndEventNames: {
            webkit: 'webkitAnimationEnd',
            gecko: 'animationend',
            presto: 'oAnimationEnd',
            trident: 'animationend'
        }
    },
    browser = browserSearchString(data.browser).toLowerCase(),
    browserVersion = browserSearchVersion(userAgent)
    os = browserSearchString(data.os),
    osVersion = osSearchVersion(userAgent, os);

function browserSearchString(data) {
    for (var i = 0; i < data.length; i++) {
        var string = data[i].string,
            property = data[i].property;

        versionSearchString = data[i].versionSearch || data[i].identity;

        if (string && string.indexOf(data[i].subString) !== -1 || property)
            return data[i].identity;
    }
    return '';
};

function browserSearchVersion(dataString) {
    var index = dataString.indexOf(versionSearchString);
    if (index === -1) return;
    return parseFloat(dataString.substring(index + versionSearchString.length + 1));
};

function osSearchVersion(dataString, os) {
    for (var i = 0; i < data.os.length; i++) {
        if (os.indexOf(data.os[i].subString) === -1) continue;
        if (data.os[i].version) {

            return data.os[i].version(dataString);
        }
    }

    return '';
};

function appleOSVersionMatch(string) {
    var matches = string.match(/(?:OS|Mac[^;]+) ([0-9_.]+)/);
    return matches ? parseFloat(matches[1].split('_').slice(0, 2).join('.')) : '';
};

// Polyfilling Class Management
UTIL.removeClass = function (element, className) {
    if (element.classList) element.classList.remove(className);
    else element.className = element.className.replace(new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
};

UTIL.addClass = function (element, className) {
    if (element.classList) element.classList.add(className);
    else element.className += ' ' + className;
};

UTIL.environment = {
    os: function () {
        return os;
    },
    osVersion: function () {
        return osVersion;
    },
    browser: function () {
        return browser;
    },
    browserVersion: function () {
        return browserVersion;
    },
    isMobile: function () {
        var isMobile = false; //initiate as false
        // device detection
        if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent)
        || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0,4))) {
            isMobile = true;
        }

        return isMobile;
    }
};

module.exports = UTIL;