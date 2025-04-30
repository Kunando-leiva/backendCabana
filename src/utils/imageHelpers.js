export const generateImageUrl = (req, filename) => {
    // Determinar el protocolo basado en el entorno
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    
    return `${protocol}://${req.get('host')}/uploads/${filename}`;
  };
  
  export const updateImageUrls = (items) => {
    return items.map(item => ({
      ...item,
      imagenes: item.imagenes.map(img => 
        img.startsWith('http://') 
          ? img.replace('http://', 'https://') 
          : img
      )
    }));
  };