'use strict'

var { languages, Completion, CompletionItem, CompletionItemKind, editor, document, window } = require('vscode')
var fs = require('fs')
var path = require('path')
var completions = []
var newComp
const readline = require('readline')

var files = fs.readdirSync(__dirname + '/completions')
for (var i in files) {
    newComp = require('./completions/' + files[i])
    completions = completions.concat(newComp)
}

const _funcPattern = /Func\s+(\w*)\s*\(/g;
const _varPattern = /\$(\w*)/g;
const _includePattern = /#include\s"(.+)"/g

module.exports = languages.registerCompletionItemProvider({ language: 'autoit', scheme: 'file' }, {
    provideCompletionItems(document, position, token) {
        // Gather the functions created by the user
        var added = {};
        var result = [];
        var text = document.getText();
        var range = document.getWordRangeAtPosition(position);
        var prefix = range ? document.getText(range) : '';

        if (!range) {
            range = new Range(position, position);
        }

        var createNewCompletionItem = function (kind, name, strDetail = 'Document Function') {
            var compItem = new CompletionItem(name, kind);
            if (kind == CompletionItemKind.Variable) {
                strDetail = 'Variable';
            }
            compItem.detail = strDetail;

            return compItem;
        };

        if (prefix[0] === '$') {
            var pattern = null;
            while (pattern = _varPattern.exec(text)) {
                var varName = pattern[0];
                if (!added[varName]) {
                    added[varName] = true;
                    result.push(createNewCompletionItem(CompletionItemKind.Variable, varName));
                }
            }
        }

        var pattern = null;
        while (pattern = _funcPattern.exec(text)) {
            var funcName = pattern[1];
            if (!added[funcName]) {
                added[funcName] = true;
                result.push(createNewCompletionItem(CompletionItemKind.Function, funcName));
            }
        }

        var pattern = null
        
        while (pattern = _includePattern.exec(text)) {
            var includeName = pattern[1]
            var includeFunctions = []
            includeFunctions = getIncludeData(includeName)

            if (includeFunctions) {
                for (var newFunc in includeFunctions) {
                    result.push(createNewCompletionItem(CompletionItemKind.Function, includeFunctions[newFunc], includeName + ' Function'))
                }
            }
        }

        return completions.concat(result);
    }
}, '.', '$')

function getIncludeData(fileName) {
    // console.log(fileName)
    const _includeFuncPattern = /^(?=\S)(?!;~\s)Func\s+(\w+)\s*\(/

    var functions = []

    var filePath =  path.dirname(window.activeTextEditor.document.fileName) + '\\' + fileName
    // console.log(filePath)
    var pattern = null

    var fileData = fs.readFileSync(filePath)

    var fileArray = fileData.toString().split("\n")

    var funcLines = fileArray.filter((line) => {
        pattern = _includeFuncPattern.exec(line)
        if (pattern) {
            functions.push(pattern[1])
        }
        return pattern
    })

    console.log(funcLines)
    return (functions)
}