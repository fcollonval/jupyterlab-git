import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IChangedArgs, ISettingRegistry } from '@jupyterlab/coreutils';
import {
  FileBrowser,
  FileBrowserModel,
  IFileBrowserFactory
} from '@jupyterlab/filebrowser';
import { IMainMenu } from '@jupyterlab/mainmenu';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { IStatusBar } from '@jupyterlab/statusbar';
import { defaultIconRegistry } from '@jupyterlab/ui-components';
import { CommandRegistry } from '@phosphor/commands';
import { Menu } from '@phosphor/widgets';
import { addCommands, CommandIDs } from './commands';
import { GitExtension } from './model';
import { registerGitIcons } from './style/icons';
import { IGitExtension } from './tokens';
import { addCloneButton } from './widgets/gitClone';
import { GitWidget } from './widgets/GitWidget';

export { Git, IGitExtension } from './tokens';

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
 * The default running sessions extension.
 */
const plugin: JupyterFrontEndPlugin<IGitExtension> = {
  id: '@jupyterlab/git:plugin',
  requires: [
    ILayoutRestorer,
    IFileBrowserFactory,
    IRenderMimeRegistry,
    ISettingRegistry
  ],
  optional: [IMainMenu, IStatusBar],
  provides: IGitExtension,
  activate,
  autoStart: true
};

/**
 * Export the plugin as default.
 */
export default plugin;

/**
 * Activate the running plugin.
 */
async function activate(
  app: JupyterFrontEnd,
  restorer: ILayoutRestorer,
  factory: IFileBrowserFactory,
  renderMime: IRenderMimeRegistry,
  settingRegistry: ISettingRegistry,
  mainMenu: IMainMenu | null,
  statusBar: IStatusBar | null
): Promise<IGitExtension> {
  let settings: ISettingRegistry.ISettings;

  // Register Git icons with the icon registry
  registerGitIcons(defaultIconRegistry);

  // Get a reference to the default file browser extension
  const filebrowser = factory.defaultBrowser;

  // Attempt to load application settings
  try {
    settings = await settingRegistry.load(plugin.id);
  } catch (error) {
    console.error(`Failed to load settings for the Git Extension.\n${error}`);
  }
  // Create the Git model
  const gitExtension = new GitExtension(app, settings);

  // Whenever we restore the application, sync the Git extension path
  Promise.all([app.restored, filebrowser.model.restored]).then(() => {
    gitExtension.pathRepository = filebrowser.model.path;
  });

  // Whenever the file browser path changes, sync the Git extension path
  filebrowser.model.pathChanged.connect(
    (model: FileBrowserModel, change: IChangedArgs<string>) => {
      gitExtension.pathRepository = change.newValue;
    }
  );
  // Whenever a user adds/renames/saves/deletes/modifies a file within the lab environment, refresh the Git status
  filebrowser.model.fileChanged.connect(() => gitExtension.refreshStatus());

  // Provided we were able to load application settings, create the extension widgets
  if (settings) {
    // Create the Git widget sidebar
    const gitPlugin = new GitWidget(gitExtension, settings, renderMime);
    gitPlugin.id = 'jp-git-sessions';
    gitPlugin.title.iconClass = 'jp-SideBar-tabIcon jp-GitIcon';
    gitPlugin.title.caption = 'Git';

    // Let the application restorer track the running panel for restoration of
    // application state (e.g. setting the running panel as the current side bar
    // widget).
    restorer.add(gitPlugin, 'git-sessions');

    // Rank has been chosen somewhat arbitrarily to give priority to the running
    // sessions widget in the sidebar.
    app.shell.add(gitPlugin, 'left', { rank: 200 });

    addCommands(app, gitExtension, factory.defaultBrowser, settings);
    // Add a menu for the plugin
    if (mainMenu) {
      mainMenu.addMenu(Private.createGitMenu(app.commands), { rank: 60 });
    }

    // Add status bar widgets
    if (statusBar) {
    }
  }
  // Add a clone button to the file browser extension toolbar
  addCloneButton(gitExtension, factory.defaultBrowser);

  return gitExtension;
}

namespace Private {
  /**
   * Add commands and menu items
   */
  export function createGitMenu(commands: CommandRegistry): Menu {
    let menu = new Menu({ commands });
    menu.title.label = 'Git';
    [
      CommandIDs.gitUI,
      CommandIDs.gitTerminalCommand,
      CommandIDs.gitInit
    ].forEach(command => {
      menu.addItem({ command });
    });

    let tutorial = new Menu({ commands });
    tutorial.title.label = ' Tutorial ';
    RESOURCES.map(args => {
      tutorial.addItem({
        args,
        command: CommandIDs.gitOpenUrl
      });
    });
    menu.addItem({ type: 'submenu', submenu: tutorial });

    menu.addItem({ type: 'separator' });

    menu.addItem({ command: CommandIDs.gitToggleSimpleStaging });

    return menu;
  }
}
