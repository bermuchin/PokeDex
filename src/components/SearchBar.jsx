function SearchBar({
  searchTerm,
  onSearchChange,
  selectedTypes,
  typeOptions,
  onTypeToggle,
  onReset,
  resultCount,
}) {
  const hasFilters = searchTerm || !selectedTypes.includes('all');

  return (
    <div className="search-container">
      <input
        type="text"
        placeholder="포켓몬 이름을 검색하세요..."
        value={searchTerm}
        onChange={(event) => onSearchChange(event.target.value)}
        className="search-input"
      />
      <div className="type-selector">
        <div className="type-buttons">
          {typeOptions.slice(1).map((option) => (
            <button
              key={option.value}
              className={`type-button ${option.value}${selectedTypes.includes(option.value) ? ' selected' : ''}`}
              onClick={() => onTypeToggle(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {hasFilters && (
        <button onClick={onReset} className="reset-button">
          필터 초기화
        </button>
      )}
      {hasFilters && (
        <div className="search-results-container">
          <div className="search-results">검색 결과: {resultCount}마리</div>
        </div>
      )}
    </div>
  );
}

export default SearchBar;
