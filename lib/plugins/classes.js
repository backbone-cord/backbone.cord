;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var convertToBool = Cord.convertToBool;
var convertToString = Cord.convertToString;
var addClass = Cord.addClass;
var removeClass = Cord.removeClass;
var regex = Cord.regex;

function _createObserver(el, cls) {
	return function(key, value) {
		// Add or remove the class based on the value
		var enabled = convertToBool(value);
		if(enabled)
			addClass(el, cls);
		else
			removeClass(el, cls);
	};
}

function _createFormatObserver(el) {
	var prev = '';
	return function(key, formatted) {
		removeClass(el, prev);
		prev = convertToString(formatted);
		addClass(el, prev);
	};
}

// Support for interpolated class names, such as div.{red}-top and conditional class names such as div.red(red)
Cord.plugins.push({
	name: 'classes',
	requirements: ['interpolation'],
	classes: function(context, classes) {
		var matchInfo;
		if(!context.isView)
			return;
		for(var i = classes.length - 1; i >= 0; --i) {
			// Check for conditional classes then dynamic classnames
			matchInfo = classes[i].match(regex.conditionalValue);
			if(matchInfo) {
				var el = context.el;
				var cls = classes[i].substr(0, matchInfo.index);
				var key = matchInfo[1];
				this.observe(key, _createObserver(el, cls), true);
				classes.splice(i, 1);
			}
			else if(classes[i].search(regex.variableSearch) !== -1) {
				this.observeFormat(classes[i], _createFormatObserver(context.el), true);
				classes.splice(i, 1);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
