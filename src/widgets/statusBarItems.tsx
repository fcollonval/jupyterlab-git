import * as React from 'react';
import { ReactWidget, UseSignal } from '@jupyterlab/apputils';
import { GroupItem, IconItem, TextItem } from '@jupyterlab/statusbar';
import { ISignal } from '@phosphor/signaling';
import { IGitExtension } from '../tokens';

interface IGitBranchItemProps {
  /**
   * Current branch name
   */
  branch: string;
}

/**
 * A pure functional component for rendering the current git branch name
 *
 * @param props the props of the component
 *
 * @returns a React function component for the active branch
 */
const GitBranch: React.FunctionComponent<IGitBranchItemProps> = (
  props: IGitBranchItemProps
) => {
  return (
    <GroupItem spacing={4}>
      <IconItem source={'jp-git-branch'} />
      <TextItem source={props.branch} />
    </GroupItem>
  );
};

/**
 * Status bar item to display the current Git branch
 *
 * @param signal Signal emitted by the Git extension when the branch changed
 */
export function createGitBranchItem(
  signal: ISignal<IGitExtension, void>
): ReactWidget {
  return ReactWidget.create(
    <UseSignal signal={signal}>
      {model =>
        model.currentBranch && <GitBranch branch={model.currentBranch.name} />
      }
    </UseSignal>
  );
}

interface IGitActionProgressProps {
  label: string;
}

const GitActionProgress: React.FunctionComponent<IGitActionProgressProps> = (
  props: IGitActionProgressProps
) => {
  return (
    <GroupItem spacing={4}>
      <TextItem source={props.label} />
      <progress />
    </GroupItem>
  );
};

export function createGitActionProgressItem(): ReactWidget {
  return ReactWidget.create(<GitActionProgress label={''} />);
}
