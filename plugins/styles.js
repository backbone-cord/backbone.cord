;(function(Backbone) {
'use strict';

var THIS_ID = '(this)';

Backbone.Cord.mediaQueries = {
	all: '',
	animations: '',
	hd: 'only screen and (max-width: 1200px)',
	desktop: 'only screen and (max-width: 992px)',
	tablet: 'only screen and (max-width: 768px)',
	phablet: 'only screen and (max-width: 480px)',
	mobile: 'only screen and (max-width: 320px)'
};

var ua = navigator.userAgent.toLowerCase();
var browser = (/(chrome|safari)/.exec(ua) || /firefox/.exec(ua) || /msie/.exec(ua) || /trident/.exec(ua) || /opera/.exec(ua) || '')[0];
var stylePrefix = ({ chrome: 'webkit', firefox: 'Moz', msie: 'ms', opera: 'O', safari: 'webkit', trident: 'ms' })[browser] || '';
var cssPrefix = '-' + stylePrefix.toLowerCase() + '-';

function _createStyleSheets() {
	var el, key;
	Backbone.Cord._styleSheets = {};
	for(key in Backbone.Cord.mediaQueries) {
		if(Backbone.Cord.mediaQueries.hasOwnProperty(key)) {
			// Note: cannot use id on stlye tags, but could add a data attribute for identifying
			// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/style
			// https://davidwalsh.name/add-rules-stylesheets
			el = document.createElement('style');
			el.type = 'text/css';
			if(Backbone.Cord.mediaQueries[key])
				el.media = Backbone.Cord.mediaQueries[key];
			// Webkit hack
			el.appendChild(document.createTextNode(''));
			document.head.appendChild(el);
			Backbone.Cord._styleSheets[key] = el.sheet;
		}
	}
}

function _getStylePrefix(style, css) {
	if(document.documentElement.style[style] === void(0))
		return css ? cssPrefix : stylePrefix;
	return '';
}

function _camelCaseToDash(str) {
	var i, c, start = 0;
	var words = [];
	for(i = 0; i < str.length; ++i) {
		c = str.charCodeAt(i);
		if(c >= 65 && c <= 90 && i) {
			words.push(str.substring(start, i).toLowerCase());
			start = i;
		}
	}
	words.push(str.substring(start, i).toLowerCase());
	return words.join('-');
}

function _addRules(rules, _styles, selector, media, id) {
	var key, sheet, query, mediaQuery, idQuery, separator;
	media = media || 'all';
	sheet = Backbone.Cord._styleSheets[media];
	for(key in rules) {
		if(rules.hasOwnProperty(key)) {
			if(typeof rules[key] === 'object') {
				mediaQuery = idQuery = null;
				separator = '>';
				query = key;
				if(query.indexOf(Backbone.Cord.config.mediaPrefix) === 0) {
					mediaQuery = query.substr(Backbone.Cord.config.mediaPrefix.length);
					if(!Backbone.Cord.mediaQueries[mediaQuery])
						return;
				}
				if(!mediaQuery) {
					if(':+~>'.indexOf(query[0]) !== -1) {
						separator = query[0];
						query = query.substr(1);
					}
					else if(query.indexOf(Backbone.Cord.config.allPrefix) === 0) {
						separator = ' ';
						query = query.substr(Backbone.Cord.config.allPrefix.length);
					}
					if('_#'.indexOf(query[0]) !== -1)
						idQuery = query.substr(1);
					if(idQuery && !Backbone.Cord.regex.testIdProperty(idQuery, true))
						idQuery = null;
				}
				if(mediaQuery)
					_addRules(rules[key], _styles, selector, mediaQuery);
				else if(idQuery)
					_addRules(rules[key], _styles, selector + separator + Backbone.Cord.regex.replaceIdSelectors('#' + idQuery), media, idQuery);
				else
					_addRules(rules[key], _styles, selector + separator + Backbone.Cord.regex.replaceIdSelectors(query), media);
			}
			else {
				var value = rules[key].toString();
				if(value.search(Backbone.Cord.regex.variableSearch) !== -1) {
					var scope = id || THIS_ID;
					if(!_styles[scope])
						_styles[scope] = {};
					_styles[scope][key] = value;
				}
				else {
					var rule = selector + '{' + _getStylePrefix(key, true) + _camelCaseToDash(key) + ':' + value + ';}';
					Backbone.Cord.log('@' + media,  rule);
					sheet.insertRule(rule, 0);
				}
			}
		}
	}
}

function _addAnimations(animations) {
	var sheet = Backbone.Cord._styleSheets.animations;
	var key, animation, keyframe, temp, step, i, rule, style, keystyles;
	for(key in animations) {
		if(animations.hasOwnProperty(key)) {
			animation = animations[key];
			if(Array.isArray(animation)) {
				if(animation.length === 1)
					animation.unshift({});
				temp = animation;
				animation = {};
				step = (100/(temp.length - 1));
				for(i = 0; i < temp.length; ++i)
					animation[Math.ceil(step * i) + '%'] = temp[i];
				animations[key] = animation;
			}
			if(Backbone.Cord.isPlainObj(animation)) {
				// Skip already processed animations, from mixins etc
				if(animation.name)
					continue;
				rule = '';
				for(keyframe in animation) {
					if(animation.hasOwnProperty(keyframe)) {
						rule += keyframe + '{';
						keystyles = animation[keyframe];
						for(style in keystyles) {
							if(keystyles.hasOwnProperty(style))
								rule += _getStylePrefix(style, true) + _camelCaseToDash(style) + ':' + keystyles[style] + ';';
						}
						rule += '}';
					}
				}
				animation.name = key + Backbone.Cord.randomCode();
				rule = '@keyframes ' + animation.name + '{' + rule + '}';
				Backbone.Cord.log(rule);
				sheet.insertRule(rule, 0);
			}
		}
	}
}

function _createStyleObserver(node, style) {
	style = _getStylePrefix(style) + style;
	return function(key, formatted) {
		node.style[style] = Backbone.Cord.convertToString(formatted);
	};
}

function _styles(context, attrs) {
	var styles = attrs.style;
	if(styles) {
		if(typeof styles === 'string' && context.isView && this[styles]) {
			styles = this[styles];
		}
		if(typeof styles === 'object') {
			// The math plugin doesn't do a deep process of the attributes so invoke string processing here
			this._callPlugins('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style)) {
					if(styles[style].match(Backbone.Cord.regex.variableSearch) && context.isView)
						this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
					else
						context.el.style[_getStylePrefix(style) + style] = styles[style];
				}
			}
			delete attrs.style;
		}
	}
}

var DEFAULT_ANIMATION_OPTIONS = {
	duration: '250ms',
	delay: '0',
	timing: 'ease',
	count: '1',
	direction: 'normal',
	fill: 'none',
	state: 'running',
	interactive: true
};

function _parseAnimationSelector(animationSelector) {
	var components = animationSelector.split(/: */);
	var animations, elements;
	if(components.length > 1) {
		animations = components[1].split(/, */);
		elements = this.el.querySelectorAll(Backbone.Cord.regex.replaceIdSelectors(components[0].trim()));
	}
	else {
		animations = components[0].split(/, */);
		elements = [this.el];
	}
	animations = animations.map(function(name) { return this.animations[name].name; }.bind(this));
	return {animations: animations, elements: elements};
}

function _getStyleListIndices(list, names) {
	var listValues = list.split(/, */);
	var indices = [];
	for(var i = 0; i < listValues.length; ++i) {
		if(names.indexOf(listValues[i]) !== -1)
			indices.push(i);
	}
	return (indices.length === listValues.length) ? true : indices;
}

function _filterStyleList(list, indices) {
	// remove all specified indices from list
	// true indicates all values are to be filtered out
	if(indices === true)
		return '';
	return list.split(/, */).filter(function(el, i) {
		return (indices.indexOf(i) === -1);
	}).join(',');
}

function _alterStyleList(list, indices, value) {
	var i, listValues = list.split(/, */);
	if(indices === true) {
		for(i = 0; i < listValues.length; ++i)
			listValues[i] = value;
	}
	else {
		for(i = 0; i < indices.length; ++i)
			listValues[indices[i]] = value;
	}
	return listValues.join(',');
}

// animationSelector is a selector: animation names string or array of strings e.g. 'p: one, two'
// TODO: make a better scoped selector syntax like the styles dictionary has
Backbone.Cord.View.prototype.beginAnimation = function(animationSelector, options, callback) {
	var parsed, animations, separator, pointerEvents, elements, el, i, j;
	var iteration, iterationListener, cancelable, endListener;
	if(!options || typeof options === 'function') {
		callback = options;
		options = {};
	}
	if(Array.isArray(animationSelector)) {
		for(i = 1; i < animationSelector; ++i)
			this.beginAnimation(animationSelector[i], options);
		animationSelector = animationSelector[0];
	}
	options = Backbone.Cord.mixObj(DEFAULT_ANIMATION_OPTIONS, options);
	pointerEvents = options.interactive ? '' : 'none';
	parsed = _parseAnimationSelector.call(this, animationSelector);
	animations = parsed.animations;
	elements = parsed.elements;
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		separator = !!el.style.animationName ? ',' : '';
		for(j = 0; j < animations.length; ++j) {
			el.style.animationDelay += separator + options.delay;
			el.style.animationDirection += separator + options.direction;
			el.style.animationDuration += separator + options.duration;
			el.style.animationIterationCount += separator + options.count;
			el.style.animationTimingFunction += separator + options.timing;
			el.style.animationFillMode += separator + options.fill;
			el.style.animationPlayState += separator + options.state;
			el.style.animationName += separator + animations[j];
			el.style.pointerEvents = pointerEvents;
			separator = ',';
		}
	}
	if(parseInt(options.count) > 1 && callback) {
		iteration = 0;
		iterationListener = function() {
			iteration += 1;
			if(callback.call(this, iteration, animationSelector, options) === false)
				this.pauseAnimation(animationSelector);
		}.bind(this);
		elements[0].addEventListener('animationiteration', iterationListener);
	}
	// If options.count is not infinite and fill is none call cancelAnimation at the end
	cancelable = (options.count !== 'infinite' && options.fill === 'none');
	endListener = function(e) {
		if(iterationListener)
			e.target.removeEventListener('animationiteration', iterationListener);
		e.target.removeEventListener('animationend', endListener);
		if(cancelable)
			this.cancelAnimation(animationSelector);
		if(callback)
			callback.call(this, -1, animationSelector, options);
	}.bind(this);
	elements[0].addEventListener('animationend', endListener);
	return this;
};

// Use with caution, updating running animations can be strange
Backbone.Cord.View.prototype._updateAnimation = function(animationSelector, property, value) {
	var parsed, animations, elements, el, i, prevAnimations, indices;
	parsed = _parseAnimationSelector.call(this, animationSelector);
	animations = parsed.animations;
	elements = parsed.elements;
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		if(el.style.animationName !== prevAnimations) {
			prevAnimations = el.style.animationName;
			indices = _getStyleListIndices(el.style.animationName, animations);
		}
		el.style[property] = _alterStyleList(el.style[property], indices, value);
	}
	return this;
};

Backbone.Cord.View.prototype.pauseAnimation = function(animationSelector) {
	return this._updateAnimation(animationSelector, 'animationPlayState', 'paused');
};

Backbone.Cord.View.prototype.resumeAnimation = function(animationSelector) {
	return this._updateAnimation(animationSelector, 'animationPlayState', 'running');
};

Backbone.Cord.View.prototype.cancelAnimation = function(animationSelector) {
	var parsed, animations, elements, el, i, prevAnimations, indices;
	parsed = _parseAnimationSelector.call(this, animationSelector);
	animations = parsed.animations;
	elements = parsed.elements;
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		if(el.style.animationName !== prevAnimations) {
			prevAnimations = el.style.animationName;
			indices = _getStyleListIndices(el.style.animationName, animations);
		}
		el.style.animationDelay = _filterStyleList(el.style.animationDelay, indices);
		el.style.animationDirection = _filterStyleList(el.style.animationDirection, indices);
		el.style.animationDuration = _filterStyleList(el.style.animationDuration, indices);
		el.style.animationIterationCount = _filterStyleList(el.style.animationIterationCount, indices);
		el.style.animationTimingFunction = _filterStyleList(el.style.animationTimingFunction, indices);
		el.style.animationFillMode = _filterStyleList(el.style.animationFillMode, indices);
		el.style.animationPlayState = _filterStyleList(el.style.animationPlayState, indices);
		el.style.animationName = _filterStyleList(el.style.animationName, indices);
		el.style.pointerEvents = '';
	}
	return this;
};

// Same arguments as beginAnimation but only used for permanent transitions of styles and apply to a single selector only
Backbone.Cord.View.prototype.beginTransition = function(selector, styles, options, callback) {
	var elements, i, el, separator, style, property, listener;
	if(Backbone.Cord.isPlainObj(selector)) {
		callback = options;
		options = styles;
		styles = selector;
		selector = null;
	}
	if(typeof options === 'function') {
		callback = options;
		options = {};
	}
	options = Backbone.Cord.mixObj(DEFAULT_ANIMATION_OPTIONS, options);
	if(selector)
		elements = this.el.querySelectorAll(Backbone.Cord.regex.replaceIdSelectors(selector));
	else
		elements = [this.el];
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		separator = !!el.style.transitionProperty ? ',' : '';
		for(style in styles) {
			if(styles.hasOwnProperty(style)) {
				property = _getStylePrefix(style) + style;
				el.style[property] = styles[style];
				el.style.transitionDelay += separator + options.delay;
				el.style.transitionDuration += separator + options.duration;
				el.style.transitionProperty += separator + _getStylePrefix(property, true) + _camelCaseToDash(property);
				el.style.transitionTimingFunction += separator + options.timing;
				separator = ',';
			}
		}
	}
	listener = function(e) {
		var i, el, properties, prevTransitions, indices;
		e.target.removeEventListener('transitionend', listener);
		properties = Object.keys(styles).map(function(property) {
			return _getStylePrefix(property, true) + _camelCaseToDash(property);
		});
		// Remove the transition properties
		for(i = 0; i < elements.length; ++i) {
			el = elements[i];
			if(el.style.transitionProperty !== prevTransitions) {
				prevTransitions = el.style.transitionProperty;
				indices = _getStyleListIndices(el.style.transitionProperty, properties);
			}
			el.style.transitionDelay = _filterStyleList(el.style.transitionDelay, indices);
			el.style.transitionDuration = _filterStyleList(el.style.transitionDuration, indices);
			el.style.transitionProperty = _filterStyleList(el.style.transitionProperty, indices);
			el.style.transitionTimingFunction = _filterStyleList(el.style.transitionTimingFunction, indices);
		}
		if(callback)
			callback.call(this, selector, styles, options);
	}.bind(this);
	elements[0].addEventListener('transitionend', listener);
	return this;
};

// Accept a style that is either an object or a key to a style object on this (non-binding!)
// e.g. {style: 'mystyle'}, where this.mystyle is an object
// To create an inline style bound to a property, use the binding plugin
// Otherwise, a normal inline-styles string will fall-through and get applied outside this plugin
// e.g. background-color: green; cursor: help;
// When interpolating variables into styles, use this over an interpolated attribute string value
// because the interpolated string value will overwrite any changes to styles on the node made through javascript e.g. the hidden plugin
// Note: interpolated styles are not supported under media queries and require idProperties to be true
Backbone.Cord.plugins.push({
	name: 'styles',
	requirements: ['interpolation'],
	config: {
		mediaPrefix: '@',
		allPrefix: '$'
	},
	attrs: _styles,
	bindings: _styles,
	extend: function(context) {
		// Look for styles hash
		var classNames, _styles = {};
		if((context.protoProps.styles || context.protoProps.animations) && context.protoProps.className) {
			if(!Backbone.Cord._styleSheets)
				_createStyleSheets();
			classNames = Backbone.Cord.getPrototypeValuesForKey(this, 'className', true);
			classNames.push(context.protoProps.className);
			classNames = classNames.join(' ');
			if(context.protoProps.styles)
				_addRules(context.protoProps.styles, _styles, '.' + classNames.split(' ').join('.'));
			if(context.protoProps.animations)
				_addAnimations(context.protoProps.animations);
		}
		context.protoProps._styles = _styles;
	},
	initialize: function(context) {
		if(this._styles && this._styles[THIS_ID]) {
			var styles = Backbone.Cord.copyObj(this._styles[THIS_ID]);
			Backbone.Cord.log(styles);
			this._callPlugins('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style))
					this.observeFormat(styles[style], _createStyleObserver(this.el, style), true);
			}
		}
	},
	complete: function(context) {
		// Apply any dynamic class styles detected from the initial extend
		if(this._styles && context.id && this._styles[context.id]) {
			var styles = Backbone.Cord.copyObj(this._styles[context.id]);
			Backbone.Cord.log(styles);
			this._callPlugins('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style))
					this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
