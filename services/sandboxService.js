const { VM } = require('vm2');
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

exports.runTestCases = async function (code, problem, language) {
  let allPassed = true;
  let error = null;
  const outputs = [];

  for (const testCase of problem.testCases) {
    let output = '';
    let testError = null;

    // Normalize input: array of lines or raw string
    const inputString = Array.isArray(testCase.input) ? testCase.input.join('\n') : (testCase.input || '');
    const inputLines = Array.isArray(testCase.input) ? [...testCase.input] : String(testCase.input || '').split('\n');
    let inputIndex = 0;

    function input() {
      return inputLines[inputIndex++];
    }
    function print(...args) {
      output += args.join(' ') + '\n';
    }

    if (language === 'java') {
      const tmp = require('tmp');
      const tmpDir = tmp.dirSync();
      const className = 'Solution';
      const javaFile = path.join(tmpDir.name, `${className}.java`);

      let javaSource = code;

      fs.writeFileSync(javaFile, javaSource);
      const compile = spawnSync('javac', [javaFile], { encoding: 'utf-8' });
      if (compile.status !== 0) {
        testError = compile.stderr ? compile.stderr.trim() : 'Compilation failed';
        output = '';
        const files = fs.readdirSync(tmpDir.name);
        for (const file of files) fs.unlinkSync(path.join(tmpDir.name, file));
        tmpDir.removeCallback();
      } else {
        const run = spawnSync('java', ['-cp', tmpDir.name, className], {
          input: inputString,
          encoding: 'utf-8',
          timeout: 2000
        });
        output = run.stdout ? run.stdout.trim().replace(/\r\n/g, '\n') : '';
        testError = run.stderr ? run.stderr.trim() : 'Runtime error';
        const files = fs.readdirSync(tmpDir.name);
        for (const file of files) fs.unlinkSync(path.join(tmpDir.name, file));
        tmpDir.removeCallback();
      }
    }

    if (output !== testCase.output.trim()) {
      allPassed = false;
    }
    console.log(allPassed)
    outputs.push({
      input: testCase.input,
      expected: testCase.output.trim(),
      output,
      passed: output === testCase.output.trim(),
      error: testError
    });
    if (testError && !error) error = testError;
  }

  return { allPassed, outputs, error };
}