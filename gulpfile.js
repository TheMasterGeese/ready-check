const gulp = require("gulp");
const zip = require('gulp-zip');

gulp.task("zip", function () {
    return gulp.src(['lang*/**/*', 'dist/**/*', 'module.json'])
        .pipe(zip('ready-check.zip'))
        .pipe(gulp.dest('out'));
});

