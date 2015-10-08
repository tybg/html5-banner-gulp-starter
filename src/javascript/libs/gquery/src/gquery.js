//ghettoQuery.js
//A lighter weight solution mimicing jquery selectors and a few functions

(function() {
    var gQuery = function (selector) {
        return new gQuery.fn.init(selector);
    };

    gQuery.each = function (selector, callback) {
        for (var i = 0; i < selector.length; i++) {
            callback(i, selector[i]);
        }
    };

    gQuery.fn = gQuery.prototype = {
        init: function (selector) {
            var element = document.querySelectorAll(selector) || [];
            if (element.length > 1) {
                this.selector = element;
            } else {
                this.selector = element[0];
            }

            return this;
        },
        css: function (object) {
            var propTypes = {
                'background-image': 'backgroundImage',
                'background-position': 'backgroundPosition'
            }

            for (var key in object) {
                if (object.hasOwnProperty(key)) {
                    var value = object[key];
                    if (propTypes.hasOwnProperty(key)) {
                        this.selector.style[propTypes[key]] = value;
                    } else {
                        this.selector.style[key] = value;
                    }
                }
            }
        },
        on: function (eventType, callback) {
            this.selector.addEventListener(eventType, callback, false);
            return this;
        }
    };

    gQuery.fn.init.prototype = gQuery.fn;

    window.gQuery = window.$ = gQuery;
})();
