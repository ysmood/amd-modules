var kit = require('nokit');
var _ = kit._;
var Promise = kit.Promise;
var cwd = process.cwd();
var deps = {};

var packInfo = require(cwd + '/package.json');
var amdModulesRoot = packInfo.amd_modules;

function cmdToAmd (name) {
    kit.logs('convert commonjs to amd:', name);

    kit.glob(kit.path.join(
        amdModulesRoot, 'amd_modules', name, '**/*.js'
    )).then(function (paths) {
        return Promise.all(paths.map(function (path) {
            return kit.readFile(path, 'utf8').then(function (js) {
                var rawPath = path.replace(/.+\/amd_modules\//, '');

                js = js.replace(
                    /(require\s*\(\s*['"])(.+)(['"]\s*\))/mg,
                    function (m, left, p, right) {
                        p = kit.path.join(
                            'amd_modules',
                            kit.path.dirname(rawPath),
                            p
                        );

                        return left + p + right;
                    }
                );

                js = "define(function (require, exports, module) {\n\n" +
                    js +
                    "\n\n});\n";

                return kit.outputFile(path, js);
            });
        }))
    });
}

function normalizeAmd (name, amd_modules) {
    kit.logs('normalize amd:', name);

    kit.glob(kit.path.join(
        amdModulesRoot, 'amd_modules', name, '**/*.js'
    )).then(function (paths) {
        return Promise.all(paths.map(function (path) {
            return kit.readFile(path, 'utf8').then(function (js) {
                js = js.replace(
                    /(define\(\[)([\w'",\s\/]+)(\])/g,
                    function (m, left, p, right) {
                        p = p.split(/,\s*/).map(function (s) {
                            s = _.trim(s, /['"]/);

                            if (!_.startsWith(s, 'amd_modules')) {
                                s = kit.path.join('amd_modules', name, amd_modules, s);
                            }

                            return '"' + s + '"';
                        }).join(', ');

                        return left + p + right;
                    }
                );

                return kit.outputFile(path, js);
            });
        }))
    });
}

function copyMod (dependencies) {
    return Promise.all(_.map(dependencies, function (p, n) {
        var modSrcPath = kit.path.join('node_modules', n);
        var to = kit.path.join(amdModulesRoot, 'amd_modules', n);
        return kit.remove(to).then(function () {
            return kit.copy(modSrcPath, to);
        })
    }));
}

function convertModules () {
    kit.glob('*', { cwd: amdModulesRoot + '/amd_modules' })
    .then(function (names) {
        return Promise.all(names.map(function (name) {
            kit.readJson(kit.path.resolve(kit.path.join(
                amdModulesRoot, 'amd_modules', name, 'package.json'
            ))).then(function (info) {
                if (info.amd_modules)
                    return normalizeAmd(name, info.amd_modules);
                else
                    return cmdToAmd(name);
            })
        }))
    });
}

function build () {
    return Promise.all([
        copyMod(packInfo.dependencies),
        Promise.all(_.map(packInfo.dependencies, function (p, n) {
            var modSrcPath = kit.path.join('node_modules', n);
            return kit.readJson(
                kit.path.resolve(kit.path.join(modSrcPath, 'package.json'))
            ).then(function (info) {
                return copyMod(info.dependencies);
            });
        }))
    ]).then(convertModules);
};

module.exports = function () {
    return kit.spawn('npm', ['i']).then(build);
}