import { window, languages, workspace } from 'vscode';
import { dirname } from 'path';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import languageConfiguration from './languageConfiguration';
import hoverFeature from './ai_hover';
import completionFeature from './ai_completion';
import symbolsFeature from './ai_symbols';
import signaturesFeature, { signatureHoverProvider } from './ai_signature';
import workspaceSymbolsFeature from './ai_workspaceSymbols';
import goToDefinitionFeature from './ai_definition';

import { registerCommands } from './registerCommands';
import { parseAu3CheckOutput } from './diagnosticUtils';
import conf from './ai_config';

const { config } = conf;

/**
 * Runs the check process for the given document and returns the console output.
 * @param {TextDocument} document - The document to run the AU3Check process on.
 * @returns {Promise<string>} A promise that resolves with the console output of the check process.
 */
const runCheckProcess = document => {
  return new Promise((resolve, reject) => {
    let consoleOutput = '';
    const params = [
      /* https://www.autoitscript.com/autoit3/docs/intro/au3check.htm */
      '-w',
      1, // already included file (on)
      '-w',
      2, // missing #comments-end (on)
      '-w',
      3, // already declared var (off)
      '-w',
      4, // local var used in global scope (off)
      '-w',
      5, // local var declared but not used (off)
      '-w',
      6, // warn when using Dim (off)
      '-w',
      7, // warn when passing Const or expression on ByRef param(s) (on)
    ];

    // Add -I for each include path
    config.includePaths.forEach(path => {
      params.push('-I', path);
    });

    // find last occurrence of #AutoIt3Wrapper_AU3Check_Parameters=
    const match = [
      ...document.getText().matchAll(/^\s*#AutoIt3Wrapper_AU3Check_Parameters=.*$/gm),
    ].pop();
    const regexp = /(-w-?)\s+([0-9]+)/g;
    while (match) {
      const [, param, value] = regexp.exec(match[0]) || [];
      if (!param) break;
      const i = (value - 1) * 2;
      // only update existing params
      if (params[i] === undefined) continue;
      params[i] = param;
      params[i + 1] = ~~value;
    }
    const checkProcess = execFile(config.checkPath, [...params, document.fileName], {
      cwd: dirname(document.fileName),
    });

    checkProcess.stdout.on('data', data => {
      if (data.length === 0) {
        return;
      }
      consoleOutput += data.toString();
    });

    checkProcess.stderr.on('error', error => {
      reject(error);
    });

    checkProcess.on('close', () => {
      resolve(consoleOutput);
    });
  });
};

const handleCheckProcessError = error => {
  window.showErrorMessage(`${config.checkPath} ${error}`);
};

const validateCheckPath = checkPath => {
  if (!existsSync(checkPath)) {
    window.showErrorMessage(
      'Invalid Check Path! Please review AutoIt settings (Check Path in UI, autoit.checkPath in JSON)',
    );
    return false;
  }
  return true;
};

/**
 * Checks the AutoIt code in the given document and updates the diagnostic collection.
 * @param {TextDocument} document - The document to check.
 * @param {DiagnosticCollection} diagnosticCollection - The diagnostic collection to update.
 */
const checkAutoItCode = async (document, diagnosticCollection) => {
  if (!config.enableDiagnostics) {
    diagnosticCollection.clear();
    return;
  }

  if (document.languageId !== 'autoit') return;

  const { checkPath } = config;
  if (!validateCheckPath(checkPath)) return;

  try {
    const consoleOutput = await runCheckProcess(document);
    parseAu3CheckOutput(consoleOutput, diagnosticCollection, document.uri);
  } catch (error) {
    handleCheckProcessError(error);
  }
};

export const activate = ctx => {
  const features = [
    hoverFeature,
    completionFeature,
    symbolsFeature,
    signaturesFeature,
    signatureHoverProvider,
    workspaceSymbolsFeature,
    goToDefinitionFeature,
  ];
  ctx.subscriptions.push(...features);

  ctx.subscriptions.push(languages.setLanguageConfiguration('autoit', languageConfiguration));

  registerCommands(ctx);

  if (process.platform === 'win32') {
    const diagnosticCollection = languages.createDiagnosticCollection('autoit');
    ctx.subscriptions.push(diagnosticCollection);

    workspace.onDidSaveTextDocument(document => checkAutoItCode(document, diagnosticCollection));
    workspace.onDidOpenTextDocument(document => checkAutoItCode(document, diagnosticCollection));
    workspace.onDidCloseTextDocument(document => {
      diagnosticCollection.delete(document.uri);
    });
    window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        checkAutoItCode(editor.document, diagnosticCollection);
      }
    });

    // Run diagnostic on document that's open when the extension loads
    if (config.enableDiagnostics && window.activeTextEditor) {
      checkAutoItCode(window.activeTextEditor.document, diagnosticCollection);
    }
  }

  // eslint-disable-next-line no-console
  console.log('AutoIt is now active!');
};

// this method is called when your extension is deactivated
// eslint-disable-next-line prettier/prettier
export function deactivate() { }
