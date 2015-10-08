//Main JS file
var gQuery = require('libs/gquery/dist/gquery.min.js'),
    UTIL = require('./util.js'),
    TweenLite = require('libs/TweenLite.js'),
    TimelineLite = require('libs/TimelineLite.js'),
    CSSPlugin = require('libs/CSSPlugin.js');
//You can use $('.class').selector or $('#id').selector for
//jQuery-like workflow. $.each(selector, callback), $.css({Object}),
//$.on(eventType, callback). Greensock TweenLite and TimelineLite
//are also included.
var Animations = (function () {
    'use strict';

    var timeline,            // Main Animation that hold the child animations
        variant,            // style... mpu / leaderboard etc
        elements = {},         // Home of all of the DOM Node Elements
        backgrounds = {};    // Just another handy container

    // Construct
    function Animations () {

    }

    // This creates all of our animation elements
    Animations.prototype.assign = function () {
        elements.ad                     = $('.ad').selector;
        elements.frame1                 = $('#frame-1').selector;
        elements.frame2                 = $('#frame-2').selector;
        elements.frame3                 = $('#frame-3').selector;
        elements.endframe               = $('#endframe').selector;
        elements.first                  = $('#element-1').selector;
        elements.second                 = $('#element-2').selector;
        elements.third                  = $('#element-3').selector;
        elements.fourth                 = $('#element-4').selector;
        elements.cta                    = $('#cta').selector;
        elements.logo                   = $('#logo').selector;

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
        // timeline = new TimelineLite( {onComplete:this.onFinish, onCompleteParams:["test1", "test2"], onCompleteScope:this } );
        timeline = new TimelineLite();

        var main = new TimelineLite();
        // Frame # 1 -------------------------------------------------------------------------
        // main animation goes here, cuz
        


        // Create timeline
        timeline.add(main);

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

    if (!UTIL.environment.isMobile()) {
        // Desktop-specific events
    } else {
        // Mobile Specific Events
    }
};