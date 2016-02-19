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

    gQuery.ajax = function (options) {
        if (typeof options === 'string') options = {url: options};
        options.url = options.url || '';
        options.method = options.method || 'get';
        options.data = options.data || {};
        options.success = options.success || function(){};

        var getParams = function(data, url) {
            var arr = [], str;
            for(var name in data) {
                arr.push(name + '=' + encodeURIComponent(data[name]));
            }
            str = arr.join('&');
            if(str != '') {
                return url ? (url.indexOf('?') < 0 ? '?' + str : '&' + str) : str;
            }
            return '';
        };

        var api = {
            host: {},
            process: function(options) {
                var self = this;
                this.xhr = null;

                if (options.dataType === 'jsonp' && options.method.toLowerCase() === 'get') {
                    var s = document.createElement('script');
                    s.type = 'text/javascript';
                    s.src = options.url + ((options.url.indexOf("?") !== -1) ? "&" : "?") + "callback=jsonpCallback";
                    var h = document.getElementsByTagName('script')[0];
                    h.parentNode.insertBefore(s, h);

                    window['jsonpCallback'] = function(data) {
                        options.success(data);
                    }

                    h.parentNode.removeChild(s);

                } else {
                    if(window.ActiveXObject) { this.xhr = new ActiveXObject('Microsoft.XMLHTTP'); }
                    else if(window.XMLHttpRequest) { this.xhr = new XMLHttpRequest(); }
                    if(this.xhr) {
                        this.xhr.onreadystatechange = function() {
                            if(self.xhr.readyState == 4 && self.xhr.status == 200) {
                                var result = self.xhr.responseText;
                                if(options.json === true && typeof JSON != 'undefined') {
                                    result = JSON.parse(result);
                                }
                                self.doneCallback && self.doneCallback.apply(self.host, [result, self.xhr]);
                            } else if(self.xhr.readyState == 4) {
                                self.failCallback && self.failCallback.apply(self.host, [self.xhr]);
                            }
                            self.alwaysCallback && self.alwaysCallback.apply(self.host, [self.xhr]);
                        }
                    }
                    if(options.method == 'get') {
                        this.xhr.open("GET", options.url + getParams(options.data, options.url), true);
                    } else {
                        this.xhr.open(options.method, options.url, true);
                        this.setHeaders({
                            'X-Requested-With': 'XMLHttpRequest',
                            'Content-type': 'application/x-www-form-urlencoded'
                        });
                    }
                    if(options.headers && typeof options.headers == 'object') {
                        this.setHeaders(options.headers);
                    }
                    setTimeout(function() {
                        options.method == 'get' ? self.xhr.send() : self.xhr.send(getParams(options.data));
                    }, 20);
                }

                return this;
            },
            done: function(callback) {
                this.doneCallback = callback;
                return this;
            },
            fail: function(callback) {
                this.failCallback = callback;
                return this;
            },
            always: function(callback) {
                this.alwaysCallback = callback;
                return this;
            },
            setHeaders: function(headers) {
                for(var name in headers) {
                    this.xhr && this.xhr.setRequestHeader(name, headers[name]);
                }
            }
        }

        return api.process(options);

    };

    gQuery.fn = gQuery.prototype = {
        init: function (selector) {
            var element = document.querySelectorAll(selector) || [];
            var about = {
                Version: 2.0,
                Author: 'gregcarrart',
                Created: '9.19.2015',
                Updated: '1.20.2016'
            }
            if (selector) {
                if (element.length > 1) {
                    this.selector = element;
                } else {
                    this.selector = element[0];
                }

                this.length = element.length;

                if (window === this) {
                    return new $(selector);
                }
                return this;
            } else {
                return about;
            }
        },
        css: function (property, style) {
            var propTypes = {
                'background-image': 'backgroundImage',
                'background-position': 'backgroundPosition',
                'background-color': 'backgroundColor',
                'background-size': 'backgroundSize',
                'background-repeat': 'backgroundRepeat',
                'background-attachment': 'backgroundAttachment',
                'background-origin': 'backgroundOrigin'
            }
            if (this.selector.length > 1) {
                for (var i = 0; i < this.selector.length; i++) {
                    if (typeof property === 'object' && typeof style === 'undefined') {
                        for (var key in property) {
                            if (property.hasOwnProperty(key)) {
                                var value = property[key];
                                if (propTypes.hasOwnProperty(key)) {
                                    this.selector[i].style[propTypes[key]] = value;
                                } else {
                                    this.selector[i].style[key] = value;
                                }
                            }
                        }
                    } else if (typeof property === 'string' && typeof style === 'string') {
                        if (propTypes.hasOwnProperty(property)) {
                            this.selector[i].style[propTypes[property]] = style;
                        } else {
                            this.selector[i].style[property] = style;
                        }
                    } else if (typeof property === 'string' && typeof style === 'undefined') {
                        var style = window.getComputedStyle(this.selector[i]);
                        return style.getPropertyValue(property);
                    } else {
                        return window.getComputedStyle(this.selector[i]);
                    }
                }
            } else {
                if (typeof property === 'object' && typeof style === 'undefined') {
                    for (var key in property) {
                        if (property.hasOwnProperty(key)) {
                            var value = property[key];
                            if (propTypes.hasOwnProperty(key)) {
                                this.selector.style[propTypes[key]] = value;
                            } else {
                                this.selector.style[key] = value;
                            }
                        }
                    }
                } else if (typeof property === 'string' && typeof style === 'string') {
                    if (propTypes.hasOwnProperty(property)) {
                        this.selector.style[propTypes[property]] = style;
                    } else {
                        this.selector.style[property] = style;
                    }
                } else if (typeof property === 'string' && typeof style === 'undefined') {
                    var style = window.getComputedStyle(this.selector);
                    return style.getPropertyValue(property);
                } else {
                    return window.getComputedStyle(this.selector);
                }
            }
        },
        map: function (callback) {
            var results = [], i = 0;
            for ( ; i < this.length; i++) {
                results.push(callback.call(this, this[i], i));
            }
            return results;
        },
        mapOne: function (callback) {
            var m = this.map(callback);
            return m.length > 1 ? m : m[0];
        },
        forEach: function (callback) {
            this.map(callback);
            return this;
        },
        on: function (eventType, callback) {
            if (this.selector.length > 1) {
                for (var i = 0; i < this.selector.length; i++) {
                    this.selector[i].addEventListener(eventType, callback, false);
                }
            } else {
                this.selector.addEventListener(eventType, callback, false);
            }
        },
        off: function (eventType, callback){
            if (this.selector.length > 1) {
                for (var i = 0; i < this.selector.length; i++) {
                    this.selector[i].removeEventListener(eventType, callback, false);
                }
            } else {
                this.selector.removeEventListener(eventType, callback, false);
            }
        },
        text: function (text) {
            if (typeof text !== 'undefined') {
                return this.forEach(function () {
                    this.selector.innerText = text;
                });
            } else {
                return this.mapOne(function () {
                    return this.selector.innerText;
                });
            }
        },
        html: function (html) {
            if (typeof html !== 'undefined') {
                this.forEach(function () {
                    this.selector.innerHTML = html;
                });
                return this;
            } else {
                return this.mapOne(function () {
                    return this.selector.innerHTML;
                });
            }
        },
        append: function(element) {
            if (typeof element !== 'undefined') {
                if (typeof element === 'string') {
                    this.selector.insertAdjacentHTML('beforeend', element);
                } else if (element.nodeType === 1) {
                    this.selector.appendChild(element);
                }
            }
        },
        prepend: function(element) {
            if (typeof element !== 'undefined') {
                if (typeof element === 'string') {
                    this.selector.insertAdjacentHTML('afterbegin', element);
                } else if (element.nodeType === 1) {
                    this.selector.insertBefore(element, this.selector.childNodes[0]);
                }
            }
        },
        addClass: function (classes) {
            var className = '';
            var el = this.selector;

            if (typeof classes !== 'string') {
                for (var i = 0; i < classes.length; i++) {
                    className += ' ' + classes[i];
                }
            } else {
                className = ' ' + classes;
            }

            return this.forEach(function () {
                this.selector.className += className;
            });
        },
        removeClass: function (cl) {
            return this.forEach(function () {
                var cs = this.selector.className.split(' '), i;

                while ( (i = cs.indexOf(cl)) > -1) {
                    cs = cs.slice(0, i).concat(cs.slice(++i));
                }
                this.selector.className = cs.join(' ');
            });
        },
        attr: function (attr, val) {
            if (typeof val !== 'undefined') {
                return this.forEach(function () {
                    this.selector.setAttribute(attr, val);
                });
            } else {
                return this.mapOne(function () {
                    return this.selector.getAttribute(attr);
                });
            }
        },
        hide: function() {
            if (this.selector.length > 1) {
                for (var i = 0; i < this.selector.length; i++) {
                    this.selector[i].style['display'] = 'none';
                }
            } else {
                this.selector.style['display'] = 'none';
            }

        },
        show: function() {
            if (this.selector.length > 1) {
                for (var i = 0; i < this.selector.length; i++) {
                    this.selector[i].style['display'] = 'block';
                }
            } else {
                this.selector.style['display'] = 'block';
            }
        }
    };

    gQuery.fn.init.prototype = gQuery.fn;

    window.gQuery = window.$ = gQuery;
})();
