;(function(Backbone) {
'use strict';

var _THIS_ID = '(this)';
var _ua = navigator.userAgent.toLowerCase();
var _browser = (/(chrome|safari)/.exec(_ua) || /firefox/.exec(_ua) || /msie/.exec(_ua) || /trident/.exec(_ua) || /opera/.exec(_ua) || '')[0];
var _stylePrefix = ({ chrome: 'webkit', firefox: 'Moz', msie: 'ms', opera: 'O', safari: 'webkit', trident: 'ms' })[_browser] || '';
var _eventPrefix = ({ chrome: 'webkit', opera: 'webkit', safari: 'webkit' })[_browser] || '';
var _cssPrefix = '-' + _stylePrefix.toLowerCase() + '-';

function _createStyleSheets() {
	var el, key;
	var mediaQueries = Backbone.Cord.Styles.mediaQueries;
	Backbone.Cord._styleSheets = {};
	for(key in mediaQueries) {
		if(mediaQueries.hasOwnProperty(key)) {
			// Note: cannot use id on stlye tags, but could add a data attribute for identifying
			// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/style
			// https://davidwalsh.name/add-rules-stylesheets
			el = document.createElement('style');
			el.type = 'text/css';
			if(mediaQueries[key])
				el.media = mediaQueries[key];
			// Webkit hack
			el.appendChild(document.createTextNode(''));
			document.head.appendChild(el);
			Backbone.Cord._styleSheets[key] = el.sheet;
		}
	}
}

function _getStylePrefix(style, css) {
	if(document.documentElement.style[style] === void(0))
		return css ? _cssPrefix : _stylePrefix;
	return '';
}

function _addStylePrefix(style) {
	var prefix = _getStylePrefix(style);
	if(prefix)
		return prefix + style[0].toUpperCase() + style.substr(1);
	return style;
}

// Really only needed for transition and animation events
// Only webkit prefix is considered given focus on modern browsers see docs for transition and animation events
// http://www.w3schools.com/jsref/dom_obj_event.asp
function _addEventPrefix(name) {
	var standard = name.toLowerCase();
	if(!_eventPrefix || Element.prototype.hasOwnProperty('on' + standard))
		return standard;
	else
		return _eventPrefix + name;
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

function _addRules(vuid, rules, _styles, selector, media, id) {
	var key, sheet, query, mediaQuery, idQuery, separator;
	media = media || 'all';
	sheet = Backbone.Cord._styleSheets[media];
	for(key in rules) {
		if(rules.hasOwnProperty(key)) {
			if(typeof rules[key] === 'object') {
				mediaQuery = idQuery = null;
				separator = '>';
				query = key;
				if(query.indexOf(Backbone.Cord.config.mediaQueryPrefix) === 0) {
					mediaQuery = query.substr(Backbone.Cord.config.mediaQueryPrefix.length);
					if(!Backbone.Cord.Styles.mediaQueries[mediaQuery])
						return;
				}
				if(!mediaQuery) {
					if(':+~>'.indexOf(query[0]) !== -1) {
						separator = query[0];
						query = query.substr(1);
					}
					else if(query.indexOf(Backbone.Cord.config.allSelectorPrefix) === 0) {
						separator = ' ';
						query = query.substr(Backbone.Cord.config.allSelectorPrefix.length);
					}
					else if(query.indexOf(Backbone.Cord.config.parentSelectorPrefix) === 0) {
						separator = '';
						query = query.substr(Backbone.Cord.config.parentSelectorPrefix.length);
					}
					if(query[0] === '#')
						idQuery = query.substr(1);
					if(idQuery && !Backbone.Cord.regex.testIdProperty(idQuery, true))
						idQuery = null;
				}
				if(mediaQuery)
					_addRules(vuid, rules[key], _styles, selector, mediaQuery);
				else if(idQuery)
					_addRules(vuid, rules[key], _styles, selector + separator + Backbone.Cord.regex.replaceIdSelectors('#' + idQuery, vuid), media, idQuery);
				else
					_addRules(vuid, rules[key], _styles, selector + separator + Backbone.Cord.regex.replaceIdSelectors(query, vuid), media);
			}
			else {
				var value = rules[key].toString();
				if(value.search(Backbone.Cord.regex.variableSearch) !== -1) {
					var scope = id || _THIS_ID;
					if(!_styles[scope])
						_styles[scope] = {};
					_styles[scope][key] = value;
				}
				else {
					var rule = selector + '{' + _getStylePrefix(key, true) + _camelCaseToDash(key) + ':' + value + ';}';
					Backbone.Cord.log('@' + media,  rule);
					sheet.insertRule(rule, sheet.cssRules.length);
				}
			}
		}
	}
}

var _atKeyframes = '@' + _getStylePrefix('animationName', true) + 'keyframes ';

function _addAnimations(vuid, animations) {
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
					if(animation.hasOwnProperty(keyframe) && keyframe !== 'options' && keyframe !== 'aliases') {
						rule += keyframe + '{';
						keystyles = animation[keyframe];
						for(style in keystyles) {
							if(keystyles.hasOwnProperty(style))
								rule += _getStylePrefix(style, true) + _camelCaseToDash(style) + ':' + keystyles[style] + ';';
						}
						rule += '}';
					}
				}
				if(vuid)
					animation.name = key + '-' + vuid;
				else
					animation.name = key;
				rule = _atKeyframes + animation.name + '{' + rule + '}';
				Backbone.Cord.log(rule);
				sheet.insertRule(rule, sheet.cssRules.length);
			}
		}
	}
}

function _createStyleObserver(node, style) {
	style = _addStylePrefix(style);
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
						context.el.style[_addStylePrefix(style)] = styles[style];
				}
			}
			delete attrs.style;
		}
	}
}

var _DEFAULT_ANIMATION_OPTIONS = {
	duration: '250ms',
	delay: '0',
	timing: 'ease',
	count: '1',
	direction: 'normal',
	fill: 'none',
	state: 'running',
	interactive: true
};

var _animationName = _addStylePrefix('animationName');
var _animationDelay = _addStylePrefix('animationDelay');
var _animationDirection = _addStylePrefix('animationDirection');
var _animationDuration = _addStylePrefix('animationDuration');
var _animationIterationCount = _addStylePrefix('animationIterationCount');
var _animationTimingFunction = _addStylePrefix('animationTimingFunction');
var _animationFillMode = _addStylePrefix('animationFillMode');
var _animationPlayState = _addStylePrefix('animationPlayState');
var _transitionDelay = _addStylePrefix('transitionDelay');
var _transitionDuration = _addStylePrefix('transitionDuration');
var _transitionProperty = _addStylePrefix('transitionProperty');
var _transitionTimingFunction = _addStylePrefix('transitionTimingFunction');

var _animationiteration = _addEventPrefix('AnimationIteration');
var _animationend = _addEventPrefix('AnimationEnd');
var _transitionend = _addEventPrefix('TransitionEnd');

function _parseAnimationSelector(animationSelector, options) {
	var i, key, animation, components = animationSelector.split(/: */);
	var animations, elements;
	if(components.length > 1) {
		animations = components[1].split(/, */);
		elements = this.el.querySelectorAll(Backbone.Cord.regex.replaceIdSelectors(components[0].trim(), this.vuid));
	}
	else {
		animations = components[0].split(/, */);
		elements = [this.el];
	}
	for(i = 0; i < animations.length; ++i) {
		key = animations[i];
		animation = this.animations[key] || Backbone.Cord.Styles.animations[key] || {name: key};
		animations[i] = animation.name;
		if(animation.options)
			options = Backbone.Cord.mixObj(animation.options, options);
	}
	return {animations: animations, elements: elements, options: options};
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
	parsed = _parseAnimationSelector.call(this, animationSelector, options);
	animations = parsed.animations;
	elements = parsed.elements;
	if(!elements.length)
		return this;
	options = Backbone.Cord.mixObj(_DEFAULT_ANIMATION_OPTIONS, parsed.options);
	pointerEvents = options.interactive ? '' : 'none';
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		separator = !!el.style[_animationName] ? ',' : '';
		for(j = 0; j < animations.length; ++j) {
			el.style[_animationDelay] += separator + options.delay;
			el.style[_animationDirection] += separator + options.direction;
			el.style[_animationDuration] += separator + options.duration;
			el.style[_animationIterationCount] += separator + options.count;
			el.style[_animationTimingFunction] += separator + options.timing;
			el.style[_animationFillMode] += separator + options.fill;
			el.style[_animationPlayState] += separator + options.state;
			el.style[_animationName] += separator + animations[j];
			el.style.pointerEvents = pointerEvents;
			separator = ',';
		}
	}
	// Add an iteration and end listener
	if(parseInt(options.count) > 1 && callback) {
		iteration = 0;
		iterationListener = function(e) {
			if(e.target !== e.currentTarget)
				return;
			iteration += 1;
			if(callback.call(this, iteration, animationSelector, options) === false)
				this.pauseAnimation(animationSelector);
		}.bind(this);
		elements[0].addEventListener(_animationiteration, iterationListener);
	}
	// If options.count is not infinite and fill is none call cancelAnimation at the end
	cancelable = (options.count !== 'infinite' && options.fill === 'none');
	endListener = function(e) {
		if(e.target !== e.currentTarget)
			return;
		if(iterationListener)
			e.target.removeEventListener(_animationiteration, iterationListener);
		e.target.removeEventListener(_animationend, endListener);
		if(cancelable)
			this.cancelAnimation(animationSelector);
		if(callback)
			callback.call(this, -1, animationSelector, options);
	}.bind(this);
	elements[0].addEventListener(_animationend, endListener);
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
		if(el.style[_animationName] !== prevAnimations) {
			prevAnimations = el.style[_animationName];
			indices = _getStyleListIndices(el.style[_animationName], animations);
		}
		el.style[property] = _alterStyleList(el.style[property], indices, value);
	}
	return this;
};

Backbone.Cord.View.prototype.pauseAnimation = function(animationSelector) {
	return this._updateAnimation(animationSelector, _animationPlayState, 'paused');
};

Backbone.Cord.View.prototype.resumeAnimation = function(animationSelector) {
	return this._updateAnimation(animationSelector, _animationPlayState, 'running');
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
		if(el.style[_animationName] !== prevAnimations) {
			prevAnimations = el.style[_animationName];
			indices = _getStyleListIndices(el.style[_animationName], animations);
		}
		el.style[_animationDelay] = _filterStyleList(el.style[_animationDelay], indices);
		el.style[_animationDirection] = _filterStyleList(el.style[_animationDirection], indices);
		el.style[_animationDuration] = _filterStyleList(el.style[_animationDuration], indices);
		el.style[_animationIterationCount] = _filterStyleList(el.style[_animationIterationCount], indices);
		el.style[_animationTimingFunction] = _filterStyleList(el.style[_animationTimingFunction], indices);
		el.style[_animationFillMode] = _filterStyleList(el.style[_animationFillMode], indices);
		el.style[_animationPlayState] = _filterStyleList(el.style[_animationPlayState], indices);
		el.style[_animationName] = _filterStyleList(el.style[_animationName], indices);
		el.style.pointerEvents = '';
	}
	return this;
};

// Same arguments as beginAnimation but only used for permanent transitions of styles and apply to a single selector only
Backbone.Cord.View.prototype.beginTransition = function(selector, styles, options, callback) {
	var elements, i, el, separator, style, listener;
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
	options = Backbone.Cord.mixObj(_DEFAULT_ANIMATION_OPTIONS, options);
	if(selector)
		elements = this.el.querySelectorAll(Backbone.Cord.regex.replaceIdSelectors(selector, this.vuid));
	else
		elements = [this.el];
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		separator = !!el.style[_transitionProperty] ? ',' : '';
		for(style in styles) {
			if(styles.hasOwnProperty(style)) {
				el.style[_transitionDelay] += separator + options.delay;
				el.style[_transitionDuration] += separator + options.duration;
				el.style[_transitionProperty] += separator + _getStylePrefix(style, true) + _camelCaseToDash(style);
				el.style[_transitionTimingFunction] += separator + options.timing;
				el.style[_addStylePrefix(style)] = styles[style];
				separator = ',';
			}
		}
	}
	listener = function(e) {
		var i, el, properties, prevTransitions, indices;
		if(e.target !== e.currentTarget)
			return;
		e.target.removeEventListener(_transitionend, listener);
		properties = Object.keys(styles).map(function(property) {
			return _getStylePrefix(property, true) + _camelCaseToDash(property);
		});
		// Remove the transition properties
		for(i = 0; i < elements.length; ++i) {
			el = elements[i];
			if(el.style[_transitionProperty] !== prevTransitions) {
				prevTransitions = el.style[_transitionProperty];
				indices = _getStyleListIndices(el.style[_transitionProperty], properties);
			}
			el.style[_transitionDelay] = _filterStyleList(el.style[_transitionDelay], indices);
			el.style[_transitionDuration] = _filterStyleList(el.style[_transitionDuration], indices);
			el.style[_transitionProperty] = _filterStyleList(el.style[_transitionProperty], indices);
			el.style[_transitionTimingFunction] = _filterStyleList(el.style[_transitionTimingFunction], indices);
		}
		if(callback)
			callback.call(this, selector, styles, options);
	}.bind(this);
	elements[0].addEventListener(_transitionend, listener);
	return this;
};

Backbone.Cord.View.prototype.applyStyles = function(selector, styles) {
	var elements, i, el, style;
	if(Backbone.Cord.isPlainObj(selector)) {
		styles = selector;
		selector = null;
	}
	if(selector)
		elements = this.el.querySelectorAll(Backbone.Cord.regex.replaceIdSelectors(selector, this.vuid));
	else
		elements = [this.el];
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		for(style in styles) {
			if(styles.hasOwnProperty(style)) {
				el.style[_addStylePrefix(style)] = styles[style];
			}
		}
	}
	return this;
};

Backbone.Cord.View.prototype.clearStyles = function(selector, styles) {
	if(Backbone.Cord.isPlainObj(selector)) {
		styles = selector;
		selector = null;
	}
	styles = Backbone.Cord.copyObj(styles);
	for(var style in styles) {
		if(styles.hasOwnProperty(style))
			styles[style] = '';
	}
	this.applyStyles(selector, styles);
	return this;
};

var _DEFAULT_KEYFRAME_ALIASES = {'0%': 'from', 'from': '0%', '100%': 'to', 'to': '100%'};

// Get styles for a keyframe from an animation with a keyframe key
// Animation properties such as animation-timing-function are excluded
// Every animation has at least 2 keyframes from/to or 0%/100%, if keyframe is excluded 0% is the default
Backbone.Cord.View.prototype.getKeyframe = function(animation, keyframe, clear) {
	var aliases, style, styles;
	animation = this.animations[animation] || Backbone.Cord.Styles.animations[animation];
	keyframe = keyframe || '0%';
	aliases = animation.aliases || {};
	styles = animation[keyframe] || animation[_DEFAULT_KEYFRAME_ALIASES[keyframe] || aliases[keyframe]];
	styles = Backbone.Cord.copyObj(styles);
	for(style in styles) {
		if(style.indexOf('animation') === 0 && styles.hasOwnProperty(style))
			delete styles[style];
	}
	if(clear) {
		for(style in styles) {
			if(styles.hasOwnProperty(style))
				styles[style] = '';
		}
	}
	return styles;
};

Backbone.Cord.View.prototype.beginKeyframeTransition = function(selector, animation, keyframe, options, callback) {
	var styles;
	if(this.animations[selector] || Backbone.Cord.Styles.animations[selector]) {
		callback = options;
		options = keyframe;
		keyframe = animation;
		animation = selector;
		selector = null;
	}
	if(typeof keyframe !== 'string') {
		callback = options;
		options = keyframe;
		keyframe = null;
	}
	if(typeof options === 'function') {
		callback = options;
		options = {};
	}
	keyframe = keyframe || '0%';
	styles = this.getKeyframe(animation, keyframe);
	if(!selector) {
		var clearKeyframe = this._appliedKeyframes[animation];
		if(clearKeyframe)
			styles = Backbone.Cord.mixObj(this.getKeyframe(animation, clearKeyframe, true), styles);
		this._appliedKeyframes[animation] = keyframe;
	}
	return this.beginTransition(selector, styles, options, callback);
};

Backbone.Cord.View.prototype.applyKeyframe = function(selector, animation, keyframe) {
	if(this.animations[selector] || Backbone.Cord.Styles.animations[selector]) {
		keyframe = animation;
		animation = selector;
		selector = null;
	}
	keyframe = keyframe || '0%';
	if(!selector)
		this._appliedKeyframes[animation] = keyframe;
	return this.applyStyles(selector, this.getKeyframe(animation, keyframe));
};

Backbone.Cord.View.prototype.clearKeyframe = function(selector, animation, keyframe) {
	if(this.animations[selector] || Backbone.Cord.Styles.animations[selector]) {
		keyframe = animation;
		animation = selector;
		selector = null;
	}
	keyframe = keyframe || '0%';
	if(!selector) {
		keyframe = this._appliedKeyframes[animation];
		delete this._appliedKeyframes[animation];
	}
	return this.clearStyles(selector, this.getKeyframe(animation, keyframe));
};

// Expose useful functions, media queries which can be modified, and some browser info
Backbone.Cord.Styles = {
	userAgent: _ua,
	browser: _browser,
	addStylePrefix: _addStylePrefix,
	addEventPrefix: _addEventPrefix,
	getCSSPrefix: function(style) { return _getStylePrefix(style, true); },
	camelCaseToDash: _camelCaseToDash,
	mediaQueries: {
		all: '',
		animations: '',
		hd: 'only screen and (max-width: 1200px)',
		desktop: 'only screen and (max-width: 992px)',
		tablet: 'only screen and (max-width: 768px)',
		phablet: 'only screen and (max-width: 480px)',
		mobile: 'only screen and (max-width: 320px)'
	},
	animations: {},
	addAnimation: function(nameAnimations, animation) {
		var animations;
		if(!Backbone.Cord.isPlainObj(nameAnimations)) {
			animations = {};
			animations[nameAnimations] = animation;
		}
		else {
			animations = nameAnimations;
		}
		_addAnimations(null, animations);
		Backbone.Cord.Styles.animations = Backbone.Cord.mixObj(Backbone.Cord.Styles.animations, animations);
	}
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
		mediaQueryPrefix: '@',
		parentSelectorPrefix: '&',
		allSelectorPrefix: '$'
	},
	attrs: _styles,
	bindings: _styles,
	extend: function(context) {
		// Look for styles hash
		var classNames, _styles = {};
		if(context.protoProps.styles || context.protoProps.animations) {
			if(!context.protoProps.className)
				context.protoProps.className = 'view-' + context.protoProps.vuid;
			if(!Backbone.Cord._styleSheets)
				_createStyleSheets();
			classNames = Backbone.Cord.getPrototypeValuesForKey(this, 'className', true);
			classNames.push(context.protoProps.className);
			classNames = classNames.join(' ');
			if(context.protoProps.styles)
				_addRules(context.protoProps.vuid, context.protoProps.styles, _styles, '.' + classNames.split(' ').join('.'));
			if(context.protoProps.animations)
				_addAnimations(context.protoProps.vuid, context.protoProps.animations);
		}
		context.protoProps._styles = _styles;
	},
	initialize: function(context) {
		if(this._styles && this._styles[_THIS_ID]) {
			var styles = Backbone.Cord.copyObj(this._styles[_THIS_ID]);
			Backbone.Cord.log(styles);
			this._callPlugins('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style))
					this.observeFormat(styles[style], _createStyleObserver(this.el, style), true);
			}
		}
		this._appliedKeyframes = {};
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
