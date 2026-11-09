import { GENERATION_LIST } from '../constants/pokemon';

function GenerationButtons({ selected, onClick, vertical }) {
  return (
    <div className={`generation-buttons${vertical ? ' vertical' : ''}`}>
      {GENERATION_LIST.map((generation) => (
        <button
          key={generation.id}
          className={`generation-btn${selected === generation.id ? ' selected' : ''}`}
          onClick={() => onClick(generation.id)}
        >
          {generation.label}
        </button>
      ))}
    </div>
  );
}

export default GenerationButtons;
