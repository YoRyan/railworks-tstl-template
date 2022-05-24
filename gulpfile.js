const fsPromises = require("fs/promises"),
    gulp = require("gulp"),
    filter = require("gulp-filter"),
    flatmap = require("gulp-flatmap"),
    intermediate = require("gulp-intermediate"),
    rename = require("gulp-rename"),
    path = require("path"),
    ts = require("typescript"),
    tstl = require("typescript-to-lua");

exports.default = exports.tstl = function (cb) {
    return gulp
        .src("src/mod/**/*.ts", { base: "src" })
        .pipe(
            flatmap(function (stream, file) {
                return stream
                    .pipe(gulp.src(["src/@types/**/*", "src/lib/**/*.ts"], { base: "src" }))
                    .pipe(
                        gulp.src(["node_modules/lua-types/**/*", "node_modules/typescript-to-lua/**/*"], { base: "." })
                    )
                    .pipe(
                        intermediate({}, async function (tempDir, cb) {
                            await compileLua(tempDir, file.relative);
                            cb();
                        })
                    )
                    .pipe(filter(["mod/**/*.lua"]));
            })
        )
        .pipe(
            rename(function (path) {
                path.dirname = path.dirname.replace(/^mod\//, "");
            })
        )
        .pipe(gulp.dest("dist"));
};

async function compileLua(tempDir, luaPath) {
    // We need the root tsconfig.json node to set the value of "include".
    const tsconfig = path.join(tempDir, "tsconfig.json");
    await fsPromises.writeFile(
        tsconfig,
        `{ "include": ["${path.join(tempDir, "@types")}", "${path.join(tempDir, "mod")}"] }`
    );

    const result = tstl.transpileProject(tsconfig, {
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        types: ["lua-types/5.0"],
        strict: true,
        typeRoots: [path.join(tempDir, "@types")],
        luaTarget: tstl.LuaTarget.Lua50,
        luaLibImport: tstl.LuaLibImportKind.Inline,
        sourceMapTraceback: false,
        luaBundle: path.join(path.dirname(luaPath), path.basename(luaPath, ".ts") + ".lua"),
        // The entry path needs to be absolute so that TSTL sets the correct module name.
        luaBundleEntry: path.join(tempDir, luaPath),
    });
    printDiagnostics(result.diagnostics);
}

function printDiagnostics(diagnostics) {
    console.log(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
            getCanonicalFileName: f => f,
            getNewLine: () => "\n",
        })
    );
}
