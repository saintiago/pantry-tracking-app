import React from 'react';
import { IngredientStatus } from '../../api/recipes/recipes';

interface IngredientAvailabilityProps {
  availability: IngredientStatus[];
  missingCount: number;
}

const chipColors: Record<IngredientStatus['status'], string> = {
  available: '#16a34a',
  partial: '#f59e0b',
  missing: '#dc2626',
};

const IngredientAvailability: React.FC<IngredientAvailabilityProps> = ({ availability, missingCount }) => {
  const summaryStyle: React.CSSProperties = {
    marginBottom: '12px',
    fontWeight: 600,
    color: missingCount > 0 ? '#dc2626' : '#16a34a',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  };

  const nameStyle: React.CSSProperties = {
    flex: 1,
    fontSize: '14px',
  };

  return (
    <div>
      <p style={summaryStyle}>
        {missingCount > 0 ? `${missingCount} ingredient(s) missing or partial` : 'All ingredients available'}
      </p>
      {availability.map((item) => {
        const chipStyle: React.CSSProperties = {
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '12px',
          backgroundColor: chipColors[item.status],
          color: '#fff',
          fontSize: '12px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        };

        let label: string;
        if (item.status === 'partial') {
          label = `have ${item.available} / need ${item.required} ${item.unit}`;
        } else if (item.status === 'missing') {
          label = 'missing';
        } else {
          label = 'available';
        }

        return (
          <div key={item.name} style={rowStyle}>
            <span style={nameStyle}>{item.name}</span>
            <span style={chipStyle}>{label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default IngredientAvailability;
