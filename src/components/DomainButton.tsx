interface DomainButtonProps {
  domain: string;
  onClick: (domain: string, event: React.MouseEvent) => void;
}

const DomainButton: React.FC<DomainButtonProps> = ({ domain, onClick }) => {
  const handleMouseDown = (event: React.MouseEvent) => {
    // Prevenir autoscroll para botón del medio (ruedita)
    if (event.button === 1) {
      event.preventDefault();
    }
    onClick(domain, event);
  };

  return (
    <button
      onMouseDown={handleMouseDown}
      onAuxClick={(event) => event.preventDefault()} // Prevenir autoscroll
    >
      .{domain}
    </button>
  );
};

export default DomainButton;
