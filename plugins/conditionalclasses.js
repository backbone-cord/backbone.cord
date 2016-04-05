;(function(Backbone) {
'use strict';

function _createObserver(el, cls) {
	return function(key, value) {
		var enabled = Backbone.Cord.convertToBool(value);
		var currentClasses = el.className.split(' ');
		var index = currentClasses.indexOf(cls);
		// Add or remove the classes
		if(enabled && index === -1)
			currentClasses.push(cls);
		else if(!enabled && index !== -1)
			currentClasses.splice(index, 1);
		el.className = currentClasses.join(' ');
	};
}

Backbone.Cord.plugins.push({
	name: 'conditionalclasses',
	classes: function(context, classes) {
		var matchInfo;
		if(!context.isView)
			return;
		for(var i = classes.length - 1; i >= 0; --i) {
			matchInfo = classes[i].match(Backbone.Cord.regex.conditionalValue);
			if(matchInfo) {
				var el = context.el;
				var cls = classes[i].substr(0, matchInfo.index);
				var key = matchInfo[1];
				this.observe(key, _createObserver(el, cls), true);
				classes.splice(i, 1);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);
