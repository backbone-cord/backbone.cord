;(function(Backbone) {
'use strict';

function _createObserver(el) {
	var indicator = 'dynamic-class-' + Math.floor(Math.random() * 9999999);
	return function(key, formatted) {
		var classes = el.className.length ? el.className.split(' ') : [];
		var index = classes.indexOf(indicator);
		if(index !== -1) {
			classes[index + 1] = Backbone.Cord.convertToString(formatted);
		}
		else {
			classes.push(indicator);
			classes.push(Backbone.Cord.convertToString(formatted));
		}
		el.className = classes.join(' ');
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

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);
