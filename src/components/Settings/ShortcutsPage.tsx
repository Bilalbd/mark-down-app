import { Section } from './controls';
import { SHORTCUT_GROUPS } from './shortcutGroups';

export function ShortcutsPage() {
  return (
    <>
      {SHORTCUT_GROUPS.map((group) => (
        <Section key={group.title} title={group.title}>
          <table className="settings__shortcuts">
            <tbody>
              {group.rows.map(([keys, action]) => (
                <tr key={keys}>
                  <td>
                    <kbd>{keys}</kbd>
                  </td>
                  <td>{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}
    </>
  );
}
