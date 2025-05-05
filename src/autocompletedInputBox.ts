import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function defaultFinishCondition(self: vscode.QuickPick<vscode.QuickPickItem>) {
    if (self.selectedItems.length == 0 || self.selectedItems[0].label == self.value) {
        return true;
    }
    else {
        self.value = self.selectedItems[0].label;
        return false;
    }
}

// Add completionType argument
export function* pathCompletionFunc(filePathOrDirPath: string, completionType: 'all' | 'directory' | 'file' = 'all'): IterableIterator<vscode.QuickPickItem> {
    let dirname: string;
    const baseDir = vscode.workspace.rootPath || require('os').homedir();
    if (!baseDir) return;

    if (!path.isAbsolute(filePathOrDirPath)) {
        filePathOrDirPath = path.join(baseDir, filePathOrDirPath);
    }

    try {
        let stat = fs.statSync(filePathOrDirPath);
        if (stat.isDirectory()) {
            dirname = filePathOrDirPath;
            // Yield directory if type is 'all' or 'directory'
            if (completionType === 'all' || completionType === 'directory') {
                yield {
                    detail: "Target directory: " + path.basename(filePathOrDirPath) + "/",
                    label: filePathOrDirPath,
                    buttons: [ { iconPath: vscode.ThemeIcon.Folder } ]
                };
            }
        } else {
            // Yield file only if type is 'all' or 'file'
            if (completionType === 'all' || completionType === 'file') {
                yield {
                    detail: "Target file: " + path.basename(filePathOrDirPath),
                    label: filePathOrDirPath,
                    buttons: [ { iconPath: vscode.ThemeIcon.File } ]
                };
            }
            dirname = path.dirname(filePathOrDirPath);
        }
    } catch {
        // Yield "Create/Rename to" suggestion only if type is 'all' or 'file'
        if (completionType === 'all' || completionType === 'file') {
            yield {
                detail: "Create/Rename to: " + path.basename(filePathOrDirPath),
                label: filePathOrDirPath,
                buttons: [ { iconPath: vscode.ThemeIcon.File } ] // Keep as file icon for creation
            };
        }
        dirname = path.dirname(filePathOrDirPath);
        try {
            fs.accessSync(dirname, fs.constants.F_OK);
        } catch {
            return;
        }
    }

    try {
        for (let name of fs.readdirSync(dirname)) {
            const fullpath = path.join(dirname, name);
            try {
                const stat = fs.statSync(fullpath); // Get stat to check type
                if (stat.isDirectory()) {
                    // Yield directory if type is 'all' or 'directory'
                    if (completionType === 'all' || completionType === 'directory') {
                        yield {
                            label: fullpath, detail: "Open " + name + "/",
                            buttons: [ { iconPath: vscode.ThemeIcon.Folder } ]
                        };
                    }
                } else {
                    // Yield file only if type is 'all' or 'file'
                    if (completionType === 'all' || completionType === 'file') {
                        yield {
                            label: fullpath, detail: "Open " + name,
                            buttons: [ { iconPath: vscode.ThemeIcon.File } ]
                        };
                    }
                }
            } catch (statErr) {
                // Ignore files we can't stat
            }
        }
    } catch (readDirErr) {
        // Ignore errors reading directory
    }
}

export async function autocompletedInputBox<T>(
    arg: {
        completion: (userinput: string) => Iterable<vscode.QuickPickItem>,
        withSelf?: undefined | ((self: vscode.QuickPick<vscode.QuickPickItem>) => any),
        stopWhen?: undefined | ((self: vscode.QuickPick<vscode.QuickPickItem>) => boolean)
    }) {
    const completionFunc = arg.completion;
    const processSelf = arg.withSelf;

    let finishCondition = defaultFinishCondition;
    if (arg.stopWhen != undefined)
        finishCondition = defaultFinishCondition


    const quickPick = vscode.window.createQuickPick();
    quickPick.canSelectMany = false;
    let disposables: vscode.Disposable[] = [];
    let result: string | undefined = undefined; // Initialize result to undefined
    let accepted = false; // Flag to track if accepted via Enter

    if (processSelf !== undefined)
        processSelf(quickPick);

    let makeTask = () => new Promise<string | undefined>(resolve => { // Return type includes undefined
        disposables.push(
            quickPick.onDidChangeValue(directoryOrFile => {
                quickPick.items = Array.from(completionFunc(quickPick.value))
                return 0;
            }),
            quickPick.onDidAccept(() => {
                if (finishCondition(quickPick)) {
                    result = quickPick.value;
                    accepted = true; // Mark as accepted
                    quickPick.hide();
                    // Don't resolve here, let onDidHide handle resolution
                }
            }),
            quickPick.onDidHide(() => {
                quickPick.dispose();
                if (accepted) {
                    resolve(result); // Resolve with the accepted value
                } else {
                    resolve(undefined); // Resolve with undefined if cancelled (e.g., Esc)
                }
            })
        );
        quickPick.show();
    });

    try {
        result = await makeTask(); // Assign the resolved value (string or undefined)
    }
    finally {
        disposables.forEach(d => d.dispose());
    }
    return result; // Return the final result (string or undefined)
}
