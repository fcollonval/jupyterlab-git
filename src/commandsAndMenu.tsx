import { JupyterFrontEnd } from '@jupyterlab/application';
import {
  Dialog,
  InputDialog,
  MainAreaWidget,
  ReactWidget,
  showDialog,
  showErrorMessage
} from '@jupyterlab/apputils';
import { PathExt } from '@jupyterlab/coreutils';
import { FileBrowser } from '@jupyterlab/filebrowser';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITerminal } from '@jupyterlab/terminal';
import { CommandRegistry } from '@lumino/commands';
import { Menu } from '@lumino/widgets';
import * as React from 'react';
import {
  Diff,
  isDiffSupported,
  RenderMimeProvider
} from './components/diff/Diff';
import { getRefValue, IDiffContext } from './components/diff/model';
import { GitExtension } from './model';
import { diffIcon } from './style/icons';
import { Git } from './tokens';
import { GitCredentialsForm } from './widgets/CredentialsBox';
import { doGitClone } from './widgets/gitClone';
import { GitPullPushDialog, Operation } from './widgets/gitPushPull';

const RESOURCES = [
  {
    text: 'Set Up Remotes',
    url: 'https://www.atlassian.com/git/tutorials/setting-up-a-repository'
  },
  {
    text: 'Git Documentation',
    url: 'https://git-scm.com/doc'
  }
];

/**
 * The command IDs used by the git plugin.
 */
export namespace CommandIDs {
  export const gitUI = 'git:ui';
  export const gitTerminalCommand = 'git:terminal-command';
  export const gitInit = 'git:init';
  export const gitOpenUrl = 'git:open-url';
  export const gitToggleSimpleStaging = 'git:toggle-simple-staging';
  export const gitToggleDoubleClickDiff = 'git:toggle-double-click-diff';
  export const gitAddRemote = 'git:add-remote';
  export const gitClone = 'git:clone';
  export const gitOpenGitignore = 'git:open-gitignore';
  export const gitPush = 'git:push';
  export const gitPull = 'git:pull';
  // Context menu commands
  export const gitFileDiff = 'git:context-diff';
  export const gitFileDiscard = 'git:context-discard';
  export const gitFileOpen = 'git:context-open';
  export const gitFileUnstage = 'git:context-unstage';
  export const gitFileAdd = 'git:context-add';
  export const gitIgnore = 'git:context-ignore';
  export const gitIgnoreExtension = 'git:context-ignoreExtension';
}

/**
 * Add the commands for the git extension.
 */
export function addCommands(
  app: JupyterFrontEnd,
  model: GitExtension,
  fileBrowser: FileBrowser,
  settings: ISettingRegistry.ISettings,
  renderMime: IRenderMimeRegistry
) {
  const { commands, shell } = app;

  /**
   * Add open terminal in the Git repository
   */
  commands.addCommand(CommandIDs.gitTerminalCommand, {
    label: 'Open Git Repository in Terminal',
    caption: 'Open a New Terminal to the Git Repository',
    execute: async args => {
      const main = (await commands.execute(
        'terminal:create-new',
        args
      )) as MainAreaWidget<ITerminal.ITerminal>;

      try {
        if (model.pathRepository !== null) {
          const terminal = main.content;
          terminal.session.send({
            type: 'stdin',
            content: [`cd "${model.pathRepository.split('"').join('\\"')}"\n`]
          });
        }

        return main;
      } catch (e) {
        console.error(e);
        main.dispose();
      }
    },
    isEnabled: () => model.pathRepository !== null
  });

  /** Add open/go to git interface command */
  commands.addCommand(CommandIDs.gitUI, {
    label: 'Git Interface',
    caption: 'Go to Git user interface',
    execute: () => {
      try {
        shell.activateById('jp-git-sessions');
      } catch (err) {
        console.error('Fail to open Git tab.');
      }
    }
  });

  /** Add git init command */
  commands.addCommand(CommandIDs.gitInit, {
    label: 'Initialize a Repository',
    caption: 'Create an empty Git repository or reinitialize an existing one',
    execute: async () => {
      const currentPath = fileBrowser.model.path;
      const result = await showDialog({
        title: 'Initialize a Repository',
        body: 'Do you really want to make this directory a Git Repo?',
        buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Yes' })]
      });

      if (result.button.accept) {
        await model.init(currentPath);
        model.pathRepository = currentPath;
      }
    },
    isEnabled: () => model.pathRepository === null
  });

  /** Open URL externally */
  commands.addCommand(CommandIDs.gitOpenUrl, {
    label: args => args['text'] as string,
    execute: args => {
      const url = args['url'] as string;
      if (url) {
        window.open(url);
      }
    }
  });

  /** add toggle for simple staging */
  commands.addCommand(CommandIDs.gitToggleSimpleStaging, {
    label: 'Simple staging',
    isToggled: () => !!settings.composite['simpleStaging'],
    execute: () => {
      settings.set('simpleStaging', !settings.composite['simpleStaging']);
    }
  });

  /** add toggle for double click opens diffs */
  commands.addCommand(CommandIDs.gitToggleDoubleClickDiff, {
    label: 'Double click opens diff',
    isToggled: () => !!settings.composite['doubleClickDiff'],
    execute: () => {
      settings.set('doubleClickDiff', !settings.composite['doubleClickDiff']);
    }
  });

  /** Command to add a remote Git repository */
  commands.addCommand(CommandIDs.gitAddRemote, {
    label: 'Add Remote Repository',
    caption: 'Add a Git remote repository',
    isEnabled: () => model.pathRepository !== null,
    execute: async args => {
      if (model.pathRepository === null) {
        console.warn('Not in a Git repository. Unable to add a remote.');
        return;
      }
      let url = args['url'] as string;
      const name = args['name'] as string;

      if (!url) {
        const result = await InputDialog.getText({
          title: 'Add a remote repository',
          placeholder: 'Remote Git repository URL'
        });

        if (result.button.accept) {
          url = result.value;
        }
      }

      if (url) {
        try {
          await model.addRemote(url, name);
        } catch (error) {
          console.error(error);
          showErrorMessage('Error when adding remote repository', error);
        }
      }
    }
  });

  /** Add git clone command */
  commands.addCommand(CommandIDs.gitClone, {
    label: 'Clone a Repository',
    caption: 'Clone a repository from a URL',
    isEnabled: () => model.pathRepository === null,
    execute: async () => {
      await doGitClone(model, fileBrowser.model.path);
      fileBrowser.model.refresh();
    }
  });

  /** Add git open gitignore command */
  commands.addCommand(CommandIDs.gitOpenGitignore, {
    label: 'Open .gitignore',
    caption: 'Open .gitignore',
    isEnabled: () => model.pathRepository !== null,
    execute: async () => {
      await model.ensureGitignore();
    }
  });

  /** Add git push command */
  commands.addCommand(CommandIDs.gitPush, {
    label: 'Push to Remote',
    caption: 'Push code to remote repository',
    isEnabled: () => model.pathRepository !== null,
    execute: async () => {
      await Private.showGitOperationDialog(model, Operation.Push).catch(
        reason => {
          console.error(
            `Encountered an error when pushing changes. Error: ${reason}`
          );
        }
      );
    }
  });

  /** Add git pull command */
  commands.addCommand(CommandIDs.gitPull, {
    label: 'Pull from Remote',
    caption: 'Pull latest code from remote repository',
    isEnabled: () => model.pathRepository !== null,
    execute: async () => {
      await Private.showGitOperationDialog(model, Operation.Pull).catch(
        reason => {
          console.error(
            `Encountered an error when pulling changes. Error: ${reason}`
          );
        }
      );
    }
  });

  /* Context menu commands */
  commands.addCommand(CommandIDs.gitFileOpen, {
    label: 'Open',
    caption: 'Open selected files',
    execute: async args => {
      const files: Git.IStatusFileResult[] = args['files'] as any;

      await Promise.all(
        files?.map(async file => {
          const { x, y, to } = file;
          if (x === 'D' || y === 'D') {
            if (files.length === 1) {
              await showErrorMessage(
                'Open File Failed',
                `${to} has been deleted!`
              );
            }
            return;
          }
          try {
            if (to[to.length - 1] !== '/') {
              await commands.execute('docmanager:open', {
                path: model.getRelativeFilePath(to)
              });
            } else {
              console.log('Cannot open a folder here');
            }
          } catch (err) {
            console.error(`Fail to open ${to}.`);
          }
        })
      );
    }
  });

  commands.addCommand(CommandIDs.gitFileDiff, {
    label: 'Diff',
    caption: 'Diff selected files',
    execute: args => {
      const files = (args['files'] as any) as {
        context?: IDiffContext;
        filePath: string;
        isText: boolean;
        status?: Git.Status;
      }[];

      files?.forEach(file => {
        const { context, filePath, isText, status } = file;
        let diffContext = context;
        if (!diffContext) {
          const specialRef = status === 'staged' ? 'INDEX' : 'WORKING';
          diffContext = {
            currentRef: { specialRef },
            previousRef: { gitRef: 'HEAD' }
          };
        }

        if (isDiffSupported(filePath) || isText) {
          const id = `nbdiff-${filePath}-${getRefValue(
            diffContext.currentRef
          )}`;
          const mainAreaItems = shell.widgets('main');
          let mainAreaItem = mainAreaItems.next();
          while (mainAreaItem) {
            if (mainAreaItem.id === id) {
              shell.activateById(id);
              break;
            }
            mainAreaItem = mainAreaItems.next();
          }

          if (!mainAreaItem) {
            const serverRepoPath = model.getRelativeFilePath();
            const nbDiffWidget = ReactWidget.create(
              <RenderMimeProvider value={renderMime}>
                <Diff
                  path={filePath}
                  diffContext={diffContext}
                  topRepoPath={serverRepoPath}
                />
              </RenderMimeProvider>
            );
            nbDiffWidget.id = id;
            nbDiffWidget.title.label = PathExt.basename(filePath);
            nbDiffWidget.title.icon = diffIcon;
            nbDiffWidget.title.closable = true;
            nbDiffWidget.addClass('jp-git-diff-parent-diff-widget');

            shell.add(nbDiffWidget, 'main');
            shell.activateById(nbDiffWidget.id);
          }
        } else {
          showErrorMessage(
            'Diff Not Supported',
            `Diff is not supported for ${PathExt.extname(
              filePath
            ).toLocaleLowerCase()} files.`
          );
        }
      });
    }
  });

  commands.addCommand(CommandIDs.gitFileAdd, {
    label: args => {
      const files: Git.IStatusFile[] = args['files'] as any;
      if (files) {
        return files[0].status === 'untracked' ? 'Track' : 'Stage';
      }
      return 'Add';
    },
    caption: args => {
      const files: Git.IStatusFile[] = args['files'] as any;
      if (files) {
        const action =
          files[0].status === 'untracked'
            ? 'Start tracking'
            : 'Stage the changes of';
        return action + ' the selected files';
      }
      return 'Add the selected files changes';
    },
    execute: async args => {
      const files: Git.IStatusFile[] = args['files'] as any;
      if (files) {
        await model.add(...files.map(file => file.to));
      }
    }
  });

  commands.addCommand(CommandIDs.gitFileUnstage, {
    label: 'Unstage',
    caption: 'Unstage the changes of the selected files',
    execute: async args => {
      const files: Git.IStatusFile[] = args['files'] as any;
      if (files) {
        await model.reset(
          ...files.filter(file => file.x !== 'D').map(file => file.to)
        );
      }
    }
  });

  commands.addCommand(CommandIDs.gitFileDiscard, {
    label: 'Discard',
    caption: 'Discard recent changes of selected files',
    execute: async args => {
      const files: Git.IStatusFile[] = args['files'] as any;

      if (!files) {
        return;
      }

      const message =
        files.length === 1 ? `${files[0].to}` : 'all selected files';

      const result = await showDialog({
        title: 'Discard changes',
        body: (
          <span>
            {`Are you sure you want to permanently discard changes to <b>${message}</b>? This action cannot be undone.`}
          </span>
        ),
        buttons: [
          Dialog.cancelButton(),
          Dialog.warnButton({ label: 'Discard' })
        ]
      });
      if (result.button.accept) {
        try {
          await model.reset(
            ...files
              .filter(
                file =>
                  file.status === 'staged' || file.status === 'partially-staged'
              )
              .map(file => file.to)
          );
          // resetting an added file moves it to untracked category => checkout will fail
          await model.checkout({
            filenames: files
              .filter(
                file =>
                  file.status === 'unstaged' ||
                  (file.status === 'partially-staged' && file.x !== 'A')
              )
              .map(file => file.to)
          });
        } catch (reason) {
          showErrorMessage(`Discard changes for ${message} failed.`, reason, [
            Dialog.warnButton({ label: 'DISMISS' })
          ]);
        }
      }
    }
  });

  commands.addCommand(CommandIDs.gitIgnore, {
    label: 'Ignore these files (add to .gitignore)',
    caption: 'Ignore these files (add to .gitignore)',
    execute: async args => {
      const files: Git.IStatusFile[] = args['files'] as any;
      if (files) {
        await model.ignore(
          files.map(file => file.to),
          false
        );
      }
    }
  });

  commands.addCommand(CommandIDs.gitIgnoreExtension, {
    label: args => {
      const files: Git.IStatusFile[] = args['files'] as any;
      const selectedFile = files[0];
      return `Ignore ${PathExt.extname(
        selectedFile.to
      )} extension (add to .gitignore)`;
    },
    caption: 'Ignore this file extension (add to .gitignore)',
    execute: async args => {
      const files: Git.IStatusFile[] = args['files'] as any;
      const selectedFile = files[0];
      if (selectedFile) {
        const extension = PathExt.extname(selectedFile.to);
        if (extension.length > 0) {
          const result = await showDialog({
            title: 'Ignore file extension',
            body: `Are you sure you want to ignore all ${extension} files within this git repository?`,
            buttons: [
              Dialog.cancelButton(),
              Dialog.okButton({ label: 'Ignore' })
            ]
          });
          if (result.button.label === 'Ignore') {
            await model.ignore([selectedFile.to], true);
          }
        }
      }
    },
    isVisible: args => {
      const files: Git.IStatusFile[] = args['files'] as any;
      if (!files || files.length > 1) {
        return false;
      }
      const extension = PathExt.extname(files[0].to);
      return extension.length > 0;
    }
  });
}

/**
 * Adds commands and menu items.
 *
 * @private
 * @param app - Jupyter front end
 * @param gitExtension - Git extension instance
 * @param fileBrowser - file browser instance
 * @param settings - extension settings
 * @returns menu
 */
export function createGitMenu(commands: CommandRegistry): Menu {
  const menu = new Menu({ commands });
  menu.title.label = 'Git';
  [
    CommandIDs.gitInit,
    CommandIDs.gitClone,
    CommandIDs.gitPush,
    CommandIDs.gitPull,
    CommandIDs.gitAddRemote,
    CommandIDs.gitTerminalCommand
  ].forEach(command => {
    menu.addItem({ command });
  });

  menu.addItem({ type: 'separator' });

  menu.addItem({ command: CommandIDs.gitToggleSimpleStaging });

  menu.addItem({ command: CommandIDs.gitToggleDoubleClickDiff });

  menu.addItem({ type: 'separator' });

  menu.addItem({ command: CommandIDs.gitOpenGitignore });

  menu.addItem({ type: 'separator' });

  const tutorial = new Menu({ commands });
  tutorial.title.label = ' Help ';
  RESOURCES.map(args => {
    tutorial.addItem({
      args,
      command: CommandIDs.gitOpenUrl
    });
  });

  menu.addItem({ type: 'submenu', submenu: tutorial });

  return menu;
}

/* eslint-disable no-inner-declarations */
namespace Private {
  /**
   * Displays an error dialog when a Git operation fails.
   *
   * @private
   * @param model - Git extension model
   * @param operation - Git operation name
   * @returns Promise for displaying a dialog
   */
  export async function showGitOperationDialog(
    model: GitExtension,
    operation: Operation
  ): Promise<void> {
    const title = `Git ${operation}`;
    let result = await showDialog({
      title: title,
      body: new GitPullPushDialog(model, operation),
      buttons: [Dialog.okButton({ label: 'DISMISS' })]
    });
    let retry = false;
    while (!result.button.accept) {
      const credentials = await showDialog({
        title: 'Git credentials required',
        body: new GitCredentialsForm(
          'Enter credentials for remote repository',
          retry ? 'Incorrect username or password.' : ''
        ),
        buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'OK' })]
      });

      if (!credentials.button.accept) {
        break;
      }

      result = await showDialog({
        title: title,
        body: new GitPullPushDialog(model, operation, credentials.value),
        buttons: [Dialog.okButton({ label: 'DISMISS' })]
      });
      retry = true;
    }
  }
}
/* eslint-enable no-inner-declarations */
