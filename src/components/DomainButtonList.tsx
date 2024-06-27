import DomainButton from "./DomainButton";

interface DomainButtonListProps {
  domains: string[];
  onClick: (domain: string, event: React.MouseEvent) => void;
}

const DomainButtonList: React.FC<DomainButtonListProps> = ({
  domains,
  onClick,
}) => {
  return (
    <>
      {domains.map((domain) => (
        <DomainButton key={domain} domain={domain} onClick={onClick} />
      ))}
    </>
  );
};

export default DomainButtonList;
