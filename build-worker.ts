import * as fsp from "fs/promises";
import { glob } from "glob";
import * as path from "path";
import { Path, PathScurry } from "path-scurry";
import ts from "typescript";
import * as tstl from "typescript-to-lua";

export type Job = {
    entryPathFromSrc: string;
};

export async function transpile(job: Job) {
    // Create a virtual project that includes the entry point file.
    const { entryPathFromSrc } = job;
    const entryFile = new PathScurry("./src").cwd.resolve(entryPathFromSrc);
    const bundleFiles = await globBundleFiles();
    const virtualProject = Object.fromEntries(await Promise.all([entryFile, ...bundleFiles].map(readVirtualFile)));

    // Call TypeScriptToLua.
    const bundleFile = (entryFile.parent ?? entryFile).resolve(path.basename(entryFile.name, ".ts") + ".lua");
    const result = tstl.transpileVirtualProject(virtualProject, {
        ...readCompilerOptions(),
        types: ["lua-types/5.0", "@typescript-to-lua/language-extensions"], // Drop the jest types.
        luaTarget: tstl.LuaTarget.Lua50,
        sourceMapTraceback: false,
        luaBundle: bundleFile.relative(),
        luaBundleEntry: entryFile.relative(),
    });
    printDiagnostics(result.diagnostics);

    // Write the result.
    for (const tf of result.transpiledFiles) {
        if (!tf.lua) continue;

        const luaPath = path.join("./dist", path.relative("./mod", tf.outPath));
        const dirPath = path.dirname(luaPath);
        const outPath = path.join(dirPath, path.basename(luaPath, ".lua") + ".out");
        await fsp.mkdir(dirPath, { recursive: true });
        await fsp.writeFile(outPath, tf.lua);
    }
}

export async function globBundleFiles() {
    return [
        ...(await glob(
            [
                "node_modules/lua-types/5.0.d.ts",
                "node_modules/lua-types/core/index-5.0.d.ts",
                "node_modules/lua-types/core/coroutine.d.ts",
                "node_modules/lua-types/core/5.0/*",
                "node_modules/lua-types/special/5.0.d.ts",
            ],
            { withFileTypes: true }
        )),
        ...(await glob(["@types/**/*", "lib/**/*.ts"], { cwd: "./src", withFileTypes: true })),
    ];
}

process.on("message", async m => {
    if (process.send === undefined) return;

    await transpile(m as Job);

    // Signal completion to the parent.
    process.send("done");
});

async function readVirtualFile(file: Path) {
    const contents = await fsp.readFile(file.fullpath(), { encoding: "utf-8" });
    return [file.relative(), contents] as [string, string];
}

function readCompilerOptions() {
    const configJson = ts.readConfigFile("./src/tsconfig.json", ts.sys.readFile);
    return ts.parseJsonConfigFileContent(configJson.config, ts.sys, ".").options;
}

function printDiagnostics(diagnostics: ts.Diagnostic[]) {
    if (diagnostics.length > 0) {
        console.log(
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
                getCanonicalFileName: f => f,
                getNewLine: () => "\n",
            })
        );
    }
}
