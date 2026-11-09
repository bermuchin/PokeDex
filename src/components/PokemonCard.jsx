function PokemonCard({ pokemon, onClick, getKoreanTypeName }) {
  return (
    <div
      className="pokemon-card"
      onClick={() => onClick(pokemon)}
      data-pokemon-id={pokemon.id}
    >
      <img src={pokemon.image} alt={pokemon.koreanName} />
      <h3>{pokemon.koreanName}</h3>
      <div className="types">
        {pokemon.types.map((type) => (
          <span key={type} className={`type ${type}`}>
            {getKoreanTypeName(type)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default PokemonCard;
