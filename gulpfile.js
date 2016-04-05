var gulp = require('gulp');
var concat = require('gulp-concat');

var scripts = ['backbone.cord.js', 'plugins/**/*.js'];
var files = {
	main: 'backbone.cord.js',
	min: 'backbone.cord.min.js'
};
var destDir = 'dist';

gulp.task('lint', function() {
	// Run linting on the all Javascript
	var jshint = require('gulp-jshint');
	return gulp.src(scripts)
		.pipe(jshint())
		.pipe(jshint.reporter());
});

gulp.task('scripts', [], function() {
	// Combine all the plugins into a single script and also create a minified version
	var uglify = require('gulp-uglify');
	return gulp.src(scripts)
		.pipe(concat(files.main))
		.pipe(gulp.dest(destDir))
		.pipe(uglify())
		.pipe(concat(files.min))
		.pipe(gulp.dest(destDir));
});

gulp.task('build', ['scripts']);

gulp.task('serve', ['build'], function() {
	var connect = require('gulp-connect');
	connect.server({root: ['dev', destDir, 'node_modules'], livereload: true});
	gulp.watch(scripts, ['scripts']);
	gulp.watch(destDir + '/**').on('change', function(event) { gulp.src(event.path).pipe(connect.reload()); });
});
gulp.task('default', ['serve']);
