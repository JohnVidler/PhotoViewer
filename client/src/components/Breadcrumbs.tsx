import { Link } from "react-router-dom";

interface BreadcrumbsProps {
  path: string;
}

export default function Breadcrumbs({ path }: BreadcrumbsProps) {
  const segments = path.split("/").filter(Boolean);

  let accumulated = "";
  const crumbs = segments.map((segment) => {
    accumulated = accumulated ? `${accumulated}/${segment}` : segment;
    return { name: segment, path: accumulated };
  });

  return (
    <nav className="breadcrumbs" aria-label="Folder path">
      <Link to="/" className="breadcrumbs__link">
        Library
      </Link>
      {crumbs.map((crumb, index) => (
        <span key={crumb.path} className="breadcrumbs__segment">
          <span className="breadcrumbs__separator">/</span>
          {index === crumbs.length - 1 ? (
            <span className="breadcrumbs__current">{crumb.name}</span>
          ) : (
            <Link to={`/${crumb.path}`} className="breadcrumbs__link">
              {crumb.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
