;(function(Backbone) {
'use strict';

function _createObserver(el) {
	var prev = '';
	return function(key, formatted) {
		Backbone.Cord.removeClass(el, prev);
		prev = Backbone.Cord.convertToString(formatted);
		Backbone.Cord.addClass(el, prev);
	};
}

// Support for interpolated class names, such as div.{_red}-top
Backbone.Cord.plugins.push({
	name: 'dynamicclasses',
	requirements: ['interpolation'],
	classes: function(context, classes) {
		if(!context.isView)
			return;
		for(var i = classes.length - 1; i >= 0; --i) {
			if(classes[i].search(Backbone.Cord.regex.variableSearch) !== -1) {
				this.observeFormat(classes[i], _createObserver(context.el), true);
				classes.splice(i, 1);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
