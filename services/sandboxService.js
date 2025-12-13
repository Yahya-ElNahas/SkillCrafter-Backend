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
      try {
        const response = await fetch('https://api.jdoodle.com/v1/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: process.env.JDOODLE_CLIENT_ID,
            clientSecret: process.env.JDOODLE_CLIENT_SECRET,
            script: code,
            language: 'java',
            versionIndex: '3',
            stdin: inputString
          })
        });
        const result = await response.json();
        if (result.statusCode === 200) {
          output = result.output.trim().replace(/\r\n/g, '\n');
        } else {
          testError = result.output || 'Execution failed';
        }
      } catch (err) {
        testError = 'JDoodle API error: ' + err.message;
      }
    } else if (language === 'python') {
      const run = spawnSync('python', ['-c', code], { input: inputString, encoding: 'utf-8', timeout: 2000 });
      output = run.stdout ? run.stdout.trim().replace(/\r\n/g, '\n') : '';
      testError = run.stderr ? run.stderr.trim() : null;
    } else if (language === 'javascript') {
      try {
        const vm = new VM({ timeout: 2000, sandbox: { input, print, console: { log: print } } });
        vm.run(code);
      } catch (err) {
        testError = err.message;
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