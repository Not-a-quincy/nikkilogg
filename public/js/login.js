let anime_url = `/api/anime?limit=18`;

fetch(anime_url)
.then(response => {
    if (!response.ok) {
        throw new Error(`HTTP ERROR IN FETCHING ANIME DATA: ${response.status}`);
    }

    return response.json();
})
.then(data => {
    render_anime_card(data);
})
.catch(error => {
  
    console.error("Error fetching or parsing anime data:", error);
});

function render_anime_card(anime_object) {
    const image_grid = document.querySelector('.image_grid');
    image_grid.innerHTML = '';

    anime_object.anime.forEach(anime => {
        const image = document.createElement('div');
        image.classList.add('image');
        image.style.backgroundImage = `url('${anime.poster_image_url || ''}')`;
        image.style.backgroundSize = 'cover';
        image.style.backgroundPosition='center top'
        image_grid.appendChild(image);
    });
}
