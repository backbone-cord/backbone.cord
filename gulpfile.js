const gulp = require('gulp');
const concat = require('gulp-concat');

const scripts = ['backbone.cord.js', 'lib/**/*.js'];
const files = {
	main: 'backbone.cord.js',
	min: 'backbone.cord.min.js'
};
const destDir = 'dist';

gulp.task('lint', () => {
	// Run linting on the all Javascript
	const jshint = require('gulp-jshint');
	return gulp.src(scripts)
		.pipe(jshint())
		.pipe(jshint.reporter());
});

gulp.task('scripts', [], () => {
	// Combine all the plugins into a single script and also create a minified version
	const uglify = require('gulp-uglify');
	return gulp.src(scripts)
		.pipe(concat(files.main))
		.pipe(gulp.dest(destDir))
		.pipe(uglify())
		.pipe(concat(files.min))
		.pipe(gulp.dest(destDir));
});

gulp.task('build', ['scripts']);

gulp.task('serve', ['build'], () => {
	const connect = require('gulp-connect');
	connect.server({root: ['dev', destDir, 'node_modules'], livereload: true});
	gulp.watch(scripts, ['scripts']);
	gulp.watch(destDir + '/**').on('change', (event) => { gulp.src(event.path).pipe(connect.reload()); });
});
gulp.task('default', ['serve']);
