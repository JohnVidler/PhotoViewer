import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { treeOf } from "../hooks/itemActions";
import type { ShareScope } from "../types";

interface BreadcrumbsProps {
  path: string;
  /** Set when the folder is inside a shared album or public link. */
  scope?: ShareScope | undefined;
}

interface Crumb {
  name: string;
  /** Where the crumb links to; omitted for crumbs that are only labels. */
  to?: string;
}

function buildCrumbs(path: string, scope: ShareScope | undefined, signedIn: boolean): Crumb[] {
  const tree = treeOf(path);
  const crumbs: Crumb[] = [];

  if (tree === "") {
    crumbs.push({ name: "Library", to: "/" });
  } else {
    if (signedIn) {
      crumbs.push({ name: "Library", to: "/" });
    }
    // Visitors without an account only ever see the one public album, so a "Public album" label would just repeat
    // the subtitle under the title.
    if (signedIn) {
      crumbs.push({ name: tree.startsWith(".shared/") ? "Shared With Me" : "Public album" });
    }
    // The shared album itself is the top of the tree, named by its real name rather than its internal id.
    crumbs.push({ name: scope?.name ?? "…", to: `/${tree}` });
  }

  let accumulated = tree;
  const inside = path.slice(tree ? tree.length + 1 : 0).split("/").filter(Boolean);
  for (const segment of inside) {
    accumulated = accumulated ? `${accumulated}/${segment}` : segment;
    crumbs.push({ name: segment, to: `/${accumulated}` });
  }

  return crumbs;
}

export default function Breadcrumbs({ path, scope }: BreadcrumbsProps) {
  const { status } = useAuth();
  const crumbs = buildCrumbs(path, scope, status?.user != null);

  return (
    <nav className="breadcrumbs" aria-label="Folder path">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span key={`${index}-${crumb.name}`} className="breadcrumbs__segment">
            {index > 0 && <span className="breadcrumbs__separator">/</span>}
            {last || !crumb.to ? (
              <span className={last ? "breadcrumbs__current" : undefined}>{crumb.name}</span>
            ) : (
              <Link to={crumb.to} className="breadcrumbs__link">
                {crumb.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
