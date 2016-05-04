;(function(Backbone) {
'use strict';

var THIS_ID = '(this)';

Backbone.Cord.mediaQueries = {
	all: '',
	hd: 'only screen and (max-width: 1200px)',
	desktop: 'only screen and (max-width: 992px)',
	tablet: 'only screen and (max-width: 768px)',
	phablet: 'only screen and (max-width: 480px)',
	mobile: 'only screen and (max-width: 320px)'
};

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
	var key, sheet, mediaQuery, idQuery;
	media = media || 'all';
	sheet = Backbone.Cord._styleSheets[media];
	for(key in rules) {
		if(rules.hasOwnProperty(key)) {
			if(typeof rules[key] === 'object') {
				mediaQuery = idQuery = null;
				if(key.indexOf(Backbone.Cord.config.mediaPrefix) === 0) {
					mediaQuery = key.substr(Backbone.Cord.config.mediaPrefix.length);
					if(!Backbone.Cord.mediaQueries[mediaQuery])
						return;
				}
				if(!mediaQuery && Backbone.Cord.mediaQueries[key])
					mediaQuery = key;
				if(!mediaQuery) {
					if(key[0] === '_' || key[0] === '#')
						idQuery = key.substr(1);
					if(idQuery && !Backbone.Cord.regex.testIdProperty(idQuery, true))
						idQuery = null;
				}
				if(mediaQuery)
					_addRules(rules[key], _styles, selector, mediaQuery);
				else if(idQuery)
					_addRules(rules[key], _styles, selector + '>' + Backbone.Cord.regex.replaceIdSelectors('#' + idQuery), media, idQuery);
				else
					_addRules(rules[key], _styles, selector + '>' + Backbone.Cord.regex.replaceIdSelectors(key), media);
			}
			else {
				if(Backbone.Cord.regex.variableSearch.test(rules[key])) {
					var scope = id || THIS_ID;
					if(!_styles[scope])
						_styles[scope] = {};
					_styles[scope][key] = rules[key];
				}
				else {
					console.log('@' + media + ' ' + selector + '{' + _camelCaseToDash(key) + ':' + rules[key] + ';}');
					sheet.insertRule(selector + '{' + _camelCaseToDash(key) + ':' + rules[key] + ';}', 0);
				}
			}
		}
	}
}

var __extend = Backbone.Cord.View.extend;
Backbone.Cord.View.extend = function(properties) {
	// Look for styles hash
	var _styles = {};
	if(properties.styles && properties.className) {
		if(!Backbone.Cord._styleSheets)
			_createStyleSheets();
		_addRules(properties.styles, _styles, '.' + properties.className.split(' ').join('.'));
	}
	var View = __extend.apply(this, Array.prototype.slice.call(arguments));
	View.prototype._styles = _styles;
	return View;
};

function _createStyleObserver(node, style) {
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
			this._plugin('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style)) {
					if(styles[style].match(Backbone.Cord.regex.variableSearch) && context.isView)
						this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
					else
						context.el.style[style] = styles[style];
				}
			}
			delete attrs.style;
		}
	}
}

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
		mediaPrefix: '@'
	},
	attrs: _styles,
	bindings: _styles,
	initialize: function(context) {
		if(this._styles && this._styles[THIS_ID]) {
			var styles = JSON.parse(JSON.stringify(this._styles[THIS_ID]));
			console.log(JSON.stringify(styles));
			this._plugin('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style))
					this.observeFormat(styles[style], _createStyleObserver(this.el, style), true);
			}
		}
	},
	complete: function(context) {
		// Apply any dynamic class styles detected from the initial extend
		if(this._styles && context.id && this._styles[context.id]) {
			var styles = JSON.parse(JSON.stringify(this._styles[context.id]));
			console.log(JSON.stringify(styles));
			this._plugin('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style))
					this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);
