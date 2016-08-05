//Main JS file
var gQuery = require('libs/gquery/dist/gquery.min.js'),
    TweenLite = require('libs/TweenLite.js'),
    TimelineLite = require('libs/TimelineLite.js'),
    CSSPlugin = require('libs/CSSPlugin.js'),
    UTIL = require('./util.js');
// You can use $('.class').selector or $('#id').selector for
// jQuery-like workflow. $.each(selector, callback), $.css({Object}),
// $.on(eventType, callback). Greensock TweenLite and TimelineLite
// are also included.
//
//
// Generate a CTA button:
//
// UTIL.cta($(selector), {
//     style: String (required),
//     w: Number (required),
//     h: Number (required),
//     posX: Number (only necessary for full),
//     posY: Number (only necessary for full),
//     color: String (required),
//     textW: Number (required),
//     textH: Number (required),
//     delay: Number (required)
// });
//
// Style:  full (full polygon, usually 300x600's),
//         right (half polygon from right side, usually 728x90's),
//         left (half polygon from left side, usually 300x250's),
//         none (no polygon from bottom, usually 160x600's)
// Color: Hex value
// Text: Make sure to include an svg named "cta-txt.svg", and enter in the
//       width and height values
// Delay: The time (in seconds) that you want cta to animate in


var Animations = (function () {
    'use strict';

    var timeline,
        elements = {};

    // Construct
    function Animations () {}

    // This creates all of our animation elements
    Animations.prototype.assign = function () {
        elements.ad                     = $('.ad').selector;
        elements.frame1                 = $('#scene-1').selector;
        elements.frame2                 = $('#scene-2').selector;
        elements.frame3                 = $('#scene-3').selector;
        elements.endframe               = $('#endframe').selector;
        elements.first                  = $('#element-1').selector;
        elements.second                 = $('#element-2').selector;
        elements.third                  = $('#element-3').selector;
        elements.fourth                 = $('#element-4').selector;
        elements.cta                    = $('#cta').selector;
        elements.logo                   = $('#logo').selector;
        elements.ctaBorder              = $('#cta-border').selector;
        elements.ctaContainer           = $('#cta-container').selector;
        elements.ctaPolygon             = $('#cta-polygon').selector;
        elements.ctaTxt                 = $('#cta-txt').selector;

        this.construct();
    };

    // This creates all of our animation elements
    Animations.prototype.construct = function () {
        var durationZoomIn      = 1,
            durationZoomOut     = 1,
            durationFadeIn      = 1,
            durationFadeOut     = 1,
            durationMove        = 0.5,
            durationSwipe       = 0.6,
            durationPan         = 4,
            pauseDuration       = 2;

        // create a home for our animations
        // example: timeline complete parameters:
        // timeline = new TimelineLite( {onComplete:this.onFinish, onCompleteParams:["test1", "test2"], onCompleteScope:this } );
        timeline = new TimelineLite();

        var main = new TimelineLite();
        // Frame # 1 -------------------------------------------------------------------------
        // main animation goes here, cuz
        main.to(elements.frame1, durationFadeIn, {autoAlpha: 1}, 0.5)

        // Create timeline
        timeline.add(main);

        // wait before starting the animation!
        timeline.pause();
    };

    // This Kicks off the animation on screen
    Animations.prototype.onFinish = function (scope) {};

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
    var clickTag = window.clickThrough;

    UTIL.cta($('#element-1'), {
        w: 160,
        h: 21,
        posX: 0,
        posY: 10,
        style: 'full',
        color: '#005096',
        textW: 90,
        textH: 7,
        animate: true,
        delay: 3
    });

    anim.assign();
    anim.begin();

    if (!UTIL.environment.isMobile()) {
        // Desktop-specific events
    } else {
        // Mobile Specific Events
    }

    //UNCOMMENT IF ADBUILDER
    // //Ad Buider
    // var dealerTag = window.dealerName;
    // if (dealerTag.length > 20 && dealerTag.length <= 35) {
    //     $('#dealer-name').css({
    //         'font-size': '1.6em',
    //         'width': '50%',
    //         'line-height': '1.1em',
    //         'margin-top': '-1em'
    //     });
    // } else if (dealerTag.length > 35){
    //     $('#dealer-name').css({
    //         'font-size': '1.1em',
    //         'line-height': '1.2em',
    //         'margin-top': '-0.5em',
    //         'width': '50%'
    //     });
    // }
    // //set the text
    // $('#dealer-name').selector.innerHTML = dealerTag;

    // DCM No longer accepts clicktags in this manner
    // $('.ad').on('click', function() {
    //     window.open(clickTag, '_blank');
    // });
};
