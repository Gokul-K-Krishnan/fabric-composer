import {Routes} from '@angular/router';
import {EditorComponent} from './editor';
import {TestComponent} from './test';
import {SettingsComponent} from './settings';
import {NoContentComponent} from './no-content';
import {GithubComponent} from './github';
import {ConnectionProfileComponent} from './connectionprofile/connectionprofile.component.ts';

export const ROUTES: Routes = [
  {path: 'editor', component: EditorComponent},
  {path: 'test', component: TestComponent},
  {path: 'settings', component: SettingsComponent},
  {path: 'profile', component: ConnectionProfileComponent},
  {path: 'github', component: GithubComponent},
  {path: '', redirectTo: 'editor', pathMatch: 'full'},
  {path: '**', component: NoContentComponent}
];
