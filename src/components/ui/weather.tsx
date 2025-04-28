function WeatherComponent(props: {city: string}) {
  return (
     <div>
        Weather for <span className="font-bold text-orange-300">{props.city}</span>
        <br/>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span>Temperature:</span>
            <span className="font-bold">25°C</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Condition:</span>
            <span className="font-bold">Sunny</span>            
          </div>
        </div>
        <div>
          <img width={100} height={100}  src="../../../public/../sun-weather-sunny.svg" alt="Sunny" />
        </div>
     </div>
  );
};

export default { WeatherComponent };