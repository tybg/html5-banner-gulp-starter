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

UTIL.cta = function(selector, options) {
    var w            = options.w,
        h            = options.h,
        posX         = options.posX || null,
        posY         = options.posY || null,
        style        = options.style,
        color        = options.color.indexOf('#') > -1 ? options.color : '#'+options.color || null,
        rollover     = options.rollover.indexOf('#') > -1 ? options.rollover : '#'+options.rollover || null,
        textW        = options.textW,
        textH        = options.textH,
        animate      = options.animate,
        delay        = options.delay,
        angleRatio   = 0.593,
        html;

    if (!w || !h || !style || !color || !textW || !textH || !animate || !delay) {
        console.error('Error UTIL.cta: Must provide input for all required paramaters.');
        return;
    }

    var ctaTimeline = new TimelineLite({onComplete:this.cta.onFinish});
    var mainCta = new TimelineLite();

    if (style == 'full') {
        html =  '<div class="element" id="cta-container" style="width: '+w+'px; height: '+h+'px; top: '+posY+'px; left: '+posX+'px;">'+
                    '<svg id="cta-border" style="stroke-dasharray: 75px 850px; stroke-dashoffset: 75px;" viewBox="0 0 '+w+' '+h+'">'+
                        '<polygon id="cta-polygon" fill="none" style="fill: '+color+'; fill-opacity: 0;" stroke="'+color+'" stroke-width="1" stroke-miterlimit="10" points="0,'+h+' '+(angleRatio*h)+',0 '+w+',0 '+(w-(angleRatio*h))+','+h+'">'+
                    '</svg>'+
                    '<div class="element" id="cta-txt" style="opacity: 0; background: url(cta-txt.svg) no-repeat; background-size: '+textW+'px '+textH+'px; left: 50%; top: 50%; width: '+textW+'px; height: '+textH+'px; margin-left:'+(-1*textW/2)+'px; margin-top: '+(-1*textH/2)+'px;"></div>'+
                '</div>';

        selector.append(html);

        if (animate) {
            var $ctaPolygon = $('#cta-polygon').selector,
                $ctaBorder = $('#cta-border').selector,
                $ctaTxt = $('#cta-txt').selector;

            mainCta.to($ctaBorder, 0.6, {css: {'stroke-dasharray': '645 850'}, ease: Power2.easeInOut}, delay)
                .to($ctaPolygon, 0.6, {css: {'fill-opacity': 1}}, delay+0.5)
                .to($ctaTxt, 0.6, {autoAlpha: 1, onComplete: function() {
                    if (!UTIL.environment.isMobile()) {
                        $('#clicktag').on('mouseover', function() {
                            if (!rollover) {
                                TweenLite.to($('#cta-polygon').selector, 0.4, {css: {'fill-opacity': '0.7'}});
                            } else {
                                TweenLite.to($('#cta-polygon').selector, 0.4, {css: {'background-color': rollover}});
                            }

                        });

                        $('#clicktag').on('mouseleave', function() {
                            if (!rollover) {
                                TweenLite.to($('#cta-polygon').selector, 0.4, {css: {'fill-opacity': '1'}});
                            } else {
                                TweenLite.to($('#cta-polygon').selector, 0.4, {css: {'background-color': color}});
                            }

                        });
                    }
                }}, delay+0.5);

            ctaTimeline.add(mainCta);
            ctaTimeline.play();
        }

    } else if (style == 'left') {
        html = '<div class="element" id="cta-container" style="width: '+w+'px; height: '+h+'px; bottom: 0; left: -'+(w+10)+'px;">'+
                    '<svg id="cta-border" viewBox="0 0 '+w+' '+h+'">'+
                        '<polygon id="cta-polygon" fill="none" style="fill: '+color+';" points="0,'+h+' 0,0 '+w+',0 '+(w-(angle*h))+','+h+'">'+
                    '</svg>'+
                    '<div class="element" id="cta-txt" style="background: url(cta-txt.svg) no-repeat; background-size: '+textW+'px '+textH+'px; left: 50%; top: 50%; width: '+textW+'px; height: '+textH+'px; margin-left:'+(-1*textW/2)+'px; margin-top: '+(-1*textH/2)+'px;"></div>'+
                '</div>';

                selector.append(html);

        if (animate) {
            var $ctaContainer = $('#cta-container').selector;

            mainCta.to($ctaContainer, 0.6, {css: {'left': -10}, ease: Power2.easeOut, onComplete: function() {
                if (!UTIL.environment.isMobile()) {
                    $('#clicktag').on('mouseover', function() {
                        TweenLite.to($ctaContainer, 0.4, {css: {'left': 0}, ease: Power2.easeOut});
                    });

                    $('#clicktag').on('mouseleave', function() {
                        TweenLite.to($ctaContainer, 0.4, {css: {'left': -10}, ease: Power2.easeOut});
                    });
                }
            }}, delay);

            ctaTimeline.add(mainCta);
            ctaTimeline.play();
        }

    } else if (style == 'right') {
        html = '<div class="element" id="cta-container" style="width: '+w+'px; height: '+h+'px; bottom: 0; right: -'+(w+10)+'px;">'+
                    '<svg id="cta-border" viewBox="0 0 '+w+' '+h+'">'+
                        '<polygon id="cta-polygon" fill="none" style="fill: '+color+';" points="0,'+h+' '+(angle*h)+',0 '+w+',0 '+w+','+h+'">'+
                    '</svg>'+
                    '<div class="element" id="cta-txt" style="background: url(cta-txt.svg) no-repeat; background-size: '+textW+'px '+textH+'px; left: 50%; top: 50%; width: '+textW+'px; height: '+textH+'px; margin-left:'+(-1*textW/2)+'px; margin-top: '+(-1*textH/2)+'px;"></div>'+
                '</div>';

        selector.append(html);

        if (animate) {
            var $ctaContainer = $('#cta-container').selector;

            mainCta.to($ctaContainer, 0.6, {css: {'right': -10}, ease: Power2.easeOut, onComplete: function() {
                if (!UTIL.environment.isMobile()) {
                    $('#clicktag').on('mouseover', function() {
                        TweenLite.to($ctaContainer, 0.4, {css: {'right': 0}, ease: Power2.easeOut});
                    });

                    $('#clicktag').on('mouseleave', function() {
                        TweenLite.to($ctaContainer, 0.4, {css: {'right': -10}, ease: Power2.easeOut});
                    });
                }
            }}, delay);

            ctaTimeline.add(mainCta);
            ctaTimeline.play();
        }

    } else if (style == 'none') {
        html = '<div class="element" id="cta-container" style="width: '+w+'px; height: '+h+'px; bottom: -'+h+'px; background-color: '+color+'; transition: background-color 0.3s ease;">'+
                    '<div class="element" id="cta-txt" style="background: url(cta-txt.svg) no-repeat; background-size: '+textW+'px '+textH+'px; left: 50%; top: 50%; width: '+textW+'px; height: '+textH+'px; margin-left:'+(-1*textW/2)+'px; margin-top: '+(-1*textH/2)+'px;"></div>'+
                '</div>';

        selector.append(html);

        if (animate) {
            var $ctaContainer = $('#cta-container').selector;

            mainCta.to($ctaContainer, 0.6, {css: {'bottom': 0}, ease: Power2.easeOut, onComplete: function() {
                if (!UTIL.environment.isMobile()) {
                    $('#clicktag').on('mouseover', function() {
                        if (!rollover) {
                            TweenLite.to($ctaContainer, 0.4, {css: {'fill-opacity': '0.7'}});
                        } else {
                            TweenLite.to($ctaContainer, 0.4, {css: {'background-color': rollover}});
                        }
                    });

                    $('#clicktag').on('mouseleave', function() {
                        if (!rollover) {
                            TweenLite.to($ctaContainer, 0.4, {css: {'fill-opacity': '1'}});
                        } else {
                            TweenLite.to($ctaContainer, 0.4, {css: {'background-color': color}});
                        }
                    });
                }
            }}, delay);

            ctaTimeline.add(mainCta);
            ctaTimeline.play();
        }

    }
}

module.exports = UTIL;
